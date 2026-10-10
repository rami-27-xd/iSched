import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { recordAudit } from "@/lib/audit"
import { departmentHasScheduleForTerm } from "@/lib/services/term-scope"
import { getProgramAllocations, type AvailabilitySlot } from "@/lib/services/allocations"
import { isUnitRole, getUnitSubjects, facultyBelongsToUnit } from "@/lib/services/unit-faculty"

/**
 * Write-permission guard for faculty availability, mirroring checkFacultyWriteAccess
 * in app/api/faculty/[id]/route.ts:
 *   SUPER_ADMIN (Dept Chair) — faculty in their own department, AND (when both
 *     sides have a cluster assigned) their own CAS cluster only.
 *   ADMIN (Program Chair) — only faculty in their own department.
 *   Everyone else (including FACULTY) — forbidden.
 *
 * NOTE: all three CAS cluster chairs share the same departmentId, so the
 * department check alone only enforces the cross-COLLEGE boundary; the cluster
 * check closes the intra-CAS gap once Faculty.clusterId is actually assigned
 * (via the Faculty edit dialog) — an unassigned faculty still falls through to
 * department-only enforcement.
 * Returns an error response to send, or null when the caller is allowed.
 */
async function checkFacultyWriteAccess(facultyId: string): Promise<{ error: NextResponse | null }> {
  const dbUser = await getCurrentUser()
  if (!dbUser || !["SUPER_ADMIN", "ADMIN", "PATHFIT", "NSTP"].includes(dbUser.role)) {
    return { error: NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 }) }
  }

  const target = await db.faculty.findUnique({
    where: { id: facultyId },
    select: { departmentId: true, clusterId: true, specializations: true },
  })
  if (!target) {
    return { error: NextResponse.json(apiError("Faculty not found"), { status: 404 }) }
  }

  if (isUnitRole(dbUser.role)) {
    const unitSubjects = await getUnitSubjects(dbUser.role)
    if (!facultyBelongsToUnit(target.specializations, unitSubjects)) {
      return { error: NextResponse.json(apiError("Forbidden — this instructor is not one of yours"), { status: 403 }) }
    }
  }

  if (dbUser.role === "ADMIN" || dbUser.role === "SUPER_ADMIN" || isUnitRole(dbUser.role)) {
    const chairDeptId = getUserDepartmentId(dbUser)
    if (!chairDeptId || target.departmentId !== chairDeptId) {
      return {
        error: NextResponse.json(
          apiError("Forbidden — you can only manage faculty in your own department"),
          { status: 403 }
        ),
      }
    }
  }

  if (dbUser.role === "SUPER_ADMIN") {
    const chairClusterId = (dbUser as any).clusterId ?? null
    if (chairClusterId && target.clusterId && target.clusterId !== chairClusterId) {
      return {
        error: NextResponse.json(
          apiError("Forbidden — this faculty member belongs to a different department head area"),
          { status: 403 }
        ),
      }
    }
  }

  return { error: null }
}

// GET - List faculty availability (optionally filtered by facultyId, semesterId)
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    // Chairs manage/view availability. The Dean no longer has Faculty Availability
    // access (restricted to Dashboard, Manage Schedules, Departments, User
    // Management and System Logs).
    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN", "PATHFIT", "NSTP"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const facultyId = searchParams.get("facultyId")
    const semesterId = searchParams.get("semesterId")

    const where: any = {}
    let allocationSlots = new Map<string, AvailabilitySlot[]>()
    if (facultyId) where.facultyId = facultyId
    if (semesterId) where.semesterId = semesterId

    // ADMIN (Program Chair) / Directors / DEAN — scoped to faculty within their own department only
    if (dbUser.role === "ADMIN" || dbUser.role === "DEAN" || isUnitRole(dbUser.role)) {
      const adminDeptId = getUserDepartmentId(dbUser)
      if (!adminDeptId) return NextResponse.json(apiResponse([]))
      // A Program Chairperson also sees the instructors allocated to their program.
      const alloc = dbUser.role === "ADMIN"
        ? await getProgramAllocations((dbUser as any).programHead?.programId, semesterId)
        : { ids: [] as string[], slotsByFaculty: new Map<string, AvailabilitySlot[]>() }
      if (alloc.ids.length > 0) {
        where.OR = [{ faculty: { departmentId: adminDeptId } }, { facultyId: { in: alloc.ids } }]
        delete where.faculty
      } else {
        where.faculty = { departmentId: adminDeptId }
      }
      allocationSlots = alloc.slotsByFaculty
    }

    const availability: any[] = await db.facultyAvailability.findMany({
      where,
      include: {
        faculty: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
        semester: { include: { academicYear: true } },
      },
      orderBy: [{ faculty: { user: { lastName: "asc" } } }, { day: "asc" }, { startTime: "asc" }],
    })

    // Allocated instructors show their FIXED windows (what the program may use),
    // not their own recorded availability.
    if (allocationSlots.size > 0) {
      const sample = new Map<string, any>()
      for (const a of availability) if (!sample.has(a.facultyId)) sample.set(a.facultyId, a)
      const kept = availability.filter((a) => !allocationSlots.has(a.facultyId))
      const synthetic: any[] = []
      for (const [fid, slots] of allocationSlots) {
        const base = sample.get(fid)
        const faculty = base?.faculty ?? (await db.faculty.findUnique({ where: { id: fid }, include: { user: { select: { firstName: true, lastName: true, email: true } } } }))
        slots.forEach((s, i) => synthetic.push({
          id: `alloc-${fid}-${i}`, facultyId: fid, semesterId: semesterId ?? base?.semesterId ?? null,
          day: s.day, startTime: s.startTime, endTime: s.endTime, faculty, semester: base?.semester ?? null, allocated: true,
        }))
      }
      return NextResponse.json(apiResponse([...kept, ...synthetic]))
    }

    return NextResponse.json(apiResponse(availability))
  } catch (error) {
    console.error("GET /api/faculty/availability error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

// POST - Create/update faculty availability
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const body = await req.json()
    const { facultyId, semesterId, slots } = body

    if (!facultyId || !semesterId || !Array.isArray(slots)) {
      return NextResponse.json(apiError("facultyId, semesterId, and slots[] are required"), { status: 400 })
    }

    const access = await checkFacultyWriteAccess(facultyId)
    if (access.error) return access.error

    // ── Max-hours cap ──────────────────────────────────────────────────────
    // The hours a chair marks as available are the hours this faculty may be
    // scheduled for, so they may not exceed Faculty.maxHoursPerWeek. The
    // timeline blocks this client-side; this is the authoritative check.
    const target = await db.faculty.findUnique({
      where: { id: facultyId },
      select: { maxHoursPerWeek: true, departmentId: true, user: { select: { firstName: true, lastName: true } } },
    })

    // ── Active schedule required ────────────────────────────────────────────
    // Availability is entered against a real scheduling run: there must be a
    // non-archived schedule for this semester that this faculty's department
    // takes part in — its own, or for CAS faculty any department's (they are
    // scheduled into every college's GEC/GEL). Archived schedules never count.
    if (!(await departmentHasScheduleForTerm(target?.departmentId, semesterId))) {
      return NextResponse.json(
        apiError("No active schedule exists for this semester in this department. Create one in Manage Schedules before setting faculty availability."),
        { status: 409 }
      )
    }
    const toMin = (t: string) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m }
    const totalMinutes = slots.reduce(
      (sum: number, s: any) => sum + Math.max(0, toMin(s.endTime) - toMin(s.startTime)),
      0
    )
    const maxHours = target?.maxHoursPerWeek ?? 30
    if (totalMinutes > maxHours * 60) {
      // Only refuse saves that ADD hours beyond the cap. A faculty whose existing
      // availability already exceeds the limit (marked before the limit was set or
      // lowered) must still be able to trim it — otherwise every reduction that
      // stays above the cap would be rejected and they could never get back under.
      const existing = await db.facultyAvailability.findMany({
        where: { facultyId, semesterId },
        select: { startTime: true, endTime: true },
      })
      const currentMinutes = existing.reduce(
        (sum, s) => sum + Math.max(0, toMin(s.endTime) - toMin(s.startTime)),
        0
      )
      if (totalMinutes > currentMinutes) {
        const name = target?.user ? `${target.user.firstName} ${target.user.lastName}`.trim() : "This faculty member"
        return NextResponse.json(
          apiError(`${name}'s availability would be ${(totalMinutes / 60).toFixed(1)} hours, over their ${maxHours}-hour weekly limit. Raise the limit or mark fewer hours.`),
          { status: 400 }
        )
      }
    }

    // Delete existing availability for this faculty+semester
    await db.facultyAvailability.deleteMany({
      where: { facultyId, semesterId },
    })

    // Create new slots
    if (slots.length > 0) {
      await db.facultyAvailability.createMany({
        data: slots.map((slot: any) => ({
          facultyId,
          semesterId,
          day: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      })
    }

    const updated = await db.facultyAvailability.findMany({
      where: { facultyId, semesterId },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    })

    const actor = await getCurrentUser()
    const facultyRow = await db.faculty.findUnique({
      where: { id: facultyId },
      select: { departmentId: true, user: { select: { firstName: true, lastName: true } } },
    })
    if (actor) {
      await recordAudit({
        actor: actor as any,
        action: "availability.updated",
        entityType: "availability",
        entityId: facultyId,
        departmentId: facultyRow?.departmentId ?? null,
        summary: `Set availability of ${facultyRow?.user?.firstName ?? ""} ${facultyRow?.user?.lastName ?? ""} (${updated.length} slots)`.trim(),
        metadata: {
          Faculty: `${facultyRow?.user?.firstName ?? ""} ${facultyRow?.user?.lastName ?? ""}`.trim(),
          Slots: updated.length,
          "Hours per week": (totalMinutes / 60).toFixed(1),
          "Max hours per week": maxHours,
        },
      })
    }

    return NextResponse.json(apiResponse(updated), { status: 201 })
  } catch (error) {
    console.error("POST /api/faculty/availability error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
