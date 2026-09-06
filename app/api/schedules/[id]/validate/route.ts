import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { detectTermConflicts } from "@/lib/services/term-conflicts"
import { apiResponse, apiError } from "@/lib/api-helpers"

/**
 * Pre-publish validation endpoint.
 * Returns all conflicts (errors + warnings) without actually publishing.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden"), { status: 403 })
    }

    const { id } = await params

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: {
        entries: {
          include: {
            subject: true,
            faculty: { include: { user: true } },
            room: true,
            section: { include: { yearLevel: { include: { program: true } } } },
          },
        },
      },
    })

    if (!schedule) {
      return NextResponse.json(apiError("Schedule not found"), { status: 404 })
    }

    if (schedule.entries.length === 0) {
      return NextResponse.json(apiResponse({
        valid: false,
        entryCount: 0,
        errors: [{ type: "NO_ENTRIES", description: "Schedule has no entries. Add at least one entry before publishing." }],
        warnings: [],
      }))
    }

    // Run conflict detection across the WHOLE semester, not just this schedule.
    // Departments share rooms and faculty within a term, so a check scoped to one
    // schedule can pass while the room is already booked by another department.
    const { conflicts } = await detectTermConflicts(id)
    const errors: { type: string; description: string }[] = conflicts.filter((c) => c.severity === "ERROR").map((c) => ({ type: c.type, description: c.description }))
    const warnings: { type: string; description: string }[] = conflicts.filter((c) => c.severity === "WARNING").map((c) => ({ type: c.type, description: c.description }))

    // Check for inactive faculty in entries
    for (const entry of schedule.entries) {
      const f = (entry as any).faculty
      const isInactive = f?.isActive === false || f?.user?.isActive === false
      if (isInactive) {
        const fname = `${f?.user?.firstName ?? ""} ${f?.user?.lastName ?? ""}`.trim()
        errors.push({
          type: "INACTIVE_FACULTY",
          description: `${fname || "A faculty member"} assigned to "${(entry as any).subject?.code}" is inactive. Remove or replace this entry before publishing.`,
        })
      }
    }

    // Additional checks — faculty availability violations
    const semesterId = schedule.semesterId
    if (semesterId) {
      const availabilities = await db.facultyAvailability.findMany({
        where: { semesterId },
      })
      const availMap = new Map<string, typeof availabilities>()
      for (const a of availabilities) {
        const key = `${a.facultyId}::${a.day}`
        if (!availMap.has(key)) availMap.set(key, [])
        availMap.get(key)!.push(a)
      }

      for (const entry of schedule.entries) {
        const key = `${entry.facultyId}::${entry.day}`
        const slots = availMap.get(key)
        if (slots && slots.length > 0) {
          const entryStart = parseInt(entry.startTime.split(":")[0]) * 60 + parseInt(entry.startTime.split(":")[1])
          const entryEnd = parseInt(entry.endTime.split(":")[0]) * 60 + parseInt(entry.endTime.split(":")[1])
          const isAvailable = slots.some((s) => {
            const sStart = parseInt(s.startTime.split(":")[0]) * 60 + parseInt(s.startTime.split(":")[1])
            const sEnd = parseInt(s.endTime.split(":")[0]) * 60 + parseInt(s.endTime.split(":")[1])
            return sStart <= entryStart && sEnd >= entryEnd
          })
          if (!isAvailable) {
            const fname = `${(entry as any).faculty?.user?.firstName ?? ""} ${(entry as any).faculty?.user?.lastName ?? ""}`.trim()
            warnings.push({
              type: "AVAILABILITY_VIOLATION",
              description: `${fname} is scheduled on ${entry.day} (${entry.startTime}-${entry.endTime}) outside their availability window for "${(entry as any).subject?.code}"`,
            })
          }
        }
      }
    }

    return NextResponse.json(apiResponse({
      valid: errors.length === 0,
      entryCount: schedule.entries.length,
      errors,
      warnings,
    }))
  } catch (error) {
    console.error("GET /api/schedules/[id]/validate error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
