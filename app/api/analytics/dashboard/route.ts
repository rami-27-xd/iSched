import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(_req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    const departmentId = getUserDepartmentId(dbUser)
    const role = dbUser?.role ?? "FACULTY"

    // Build schedule filters: role-based.
    // scheduleWhere drives the "Recent Schedules" LIST and the active-schedule KPI.
    //
    // A Program Chair used to get `status: PUBLISHED` with NO department filter,
    // on the reasoning that they need to see the Dept Chair's GEC work. That
    // reasoning is wrong for the same reason it was wrong in GET /api/schedules:
    // the Dept Chair plots GEC into this chair's OWN department schedule, which
    // is in scope either way. What the missing filter actually did was put every
    // other college's published schedules on a Program Chair's dashboard — the
    // CEN chair seeing CIT's and CAS's schedules — contradicting the rule in
    // CLAUDE.md that a Program Chair is locked to their own college.
    //
    // Every role is now scoped to its own department, and a chair with no
    // department configured resolves to no schedules rather than all of them,
    // so a misconfigured account fails closed.
    const scheduleWhere: any = { isArchived: false }
    if (role === "ADMIN") {
      scheduleWhere.departmentId = departmentId ?? "__none__"
    } else if (departmentId) {
      // SUPER_ADMIN / FACULTY: scope to own department
      scheduleWhere.departmentId = departmentId
    }

    // Separate scope for the "work in progress" KPIs (unassigned + conflicts).
    // These are generated DURING generation, which happens on a DRAFT schedule —
    // so reusing scheduleWhere above made them structurally always zero: a
    // Program Chair's filter (status: PUBLISHED) can never match a DRAFT, and a
    // CAS Dept Chair's filter (departmentId: CAS) can never match the CIT
    // schedule they inject GEC into. Scope by the schedules a chair actually
    // works on instead, at any status:
    //   ADMIN       — their own department's schedules.
    //   SUPER_ADMIN — every non-archived schedule; they generate GEC into other
    //                 colleges' schedules, so those failures are theirs to see.
    const workScheduleWhere: any = { isArchived: false }
    if (role === "ADMIN" && departmentId) {
      workScheduleWhere.departmentId = departmentId
    } else if (role === "FACULTY" && departmentId) {
      workScheduleWhere.departmentId = departmentId
    }

    const [
      scheduleCount,
      facultyCount,
      roomCount,
      conflictCount,
      unassignedCount,
      recentSchedules,
    ] = await Promise.all([
      db.schedule.count({ where: scheduleWhere }),
      db.faculty.count({ where: { isActive: true, ...(departmentId ? { departmentId } : {}) } }),
      db.room.count({ where: { isActive: true } }),
      // Unresolved conflicts on the schedules this chair works on. Previously
      // unscoped entirely, so every chair saw every department's conflicts.
      db.conflictLog.count({ where: { resolved: false, schedule: workScheduleWhere } }),
      // Subjects the engine could NOT place at all (no matching-specialization
      // faculty, no available room/slot). Distinct from conflicts (placed but
      // clashing). Scoped to whoever RAN the generate — not to every chair who
      // can see the schedule (same rule as the schedule detail GET route).
      db.unassignedEntry.count({ where: { schedule: workScheduleWhere, generatedBy: dbUser?.id ?? "__none__" } }),
      db.schedule.findMany({
        where: scheduleWhere,
        include: {
          semester: { include: { academicYear: true } },
          _count: {
            select: {
              entries: true,
              conflicts: true,
              // Filtered relation count: same generator-scoping as the KPI above,
              // so the per-schedule "N unassigned" badge in Recent Schedules
              // doesn't leak another chair's failure count.
              unassigned: { where: { generatedBy: dbUser?.id ?? "__none__" } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ])

    return NextResponse.json(apiResponse({
      stats: {
        activeSchedules: scheduleCount,
        totalFaculty: facultyCount,
        availableRooms: roomCount,
        conflictsDetected: conflictCount,
        unassignedSubjects: unassignedCount,
      },
      recentSchedules,
      userRole: role,
    }))
  } catch (error) {
    console.error("GET /api/analytics/dashboard error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
