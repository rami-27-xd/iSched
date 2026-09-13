import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

/**
 * GET /api/faculty/workload?semesterId=…
 *
 * Scheduled teaching load per faculty for one semester — the sum of every
 * schedule-entry session's duration (end − start) across all non-archived
 * schedules in that semester, regardless of workflow status. Drafts count:
 * the point of the Faculty Availability workload tracker is to show the load
 * a chair is building up in real time, not only what has been published.
 *
 * Response: { [facultyId]: { scheduledMinutes, entryCount, classCount } }
 *   classCount = distinct subject+section+set assignments (an MWF class is
 *   three rows but one class).
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const semesterId = searchParams.get("semesterId")
    if (!semesterId) {
      return NextResponse.json(apiError("semesterId is required"), { status: 400 })
    }

    // Same scoping as GET /api/faculty/availability: a Program Chair only ever
    // sees faculty in their own department.
    const facultyScope =
      dbUser.role === "ADMIN"
        ? { faculty: { departmentId: getUserDepartmentId(dbUser) ?? "__none__" } }
        : {}

    const entries = await db.scheduleEntry.findMany({
      where: {
        schedule: { semesterId, isArchived: false },
        ...facultyScope,
      },
      select: { facultyId: true, subjectId: true, sectionId: true, set: true, startTime: true, endTime: true },
    })

    const out: Record<string, { scheduledMinutes: number; entryCount: number; classCount: number }> = {}
    const classKeys = new Map<string, Set<string>>()
    for (const e of entries) {
      const row = (out[e.facultyId] ??= { scheduledMinutes: 0, entryCount: 0, classCount: 0 })
      row.scheduledMinutes += Math.max(0, toMinutes(e.endTime) - toMinutes(e.startTime))
      row.entryCount += 1
      const keys = classKeys.get(e.facultyId) ?? new Set<string>()
      keys.add(`${e.subjectId}__${e.sectionId}__${e.set ?? ""}`)
      classKeys.set(e.facultyId, keys)
    }
    for (const [fid, keys] of classKeys) out[fid].classCount = keys.size

    return NextResponse.json(apiResponse(out))
  } catch (error) {
    console.error("GET /api/faculty/workload error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
