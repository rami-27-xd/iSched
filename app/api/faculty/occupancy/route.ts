import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { TBA_EMPLOYEE_ID } from "@/lib/sentinels"
import { getProgramAllocations } from "@/lib/services/allocations"
import { formatFacultyType } from "@/lib/faculty-types"

// GET /api/faculty/occupancy?semesterId=
// Every class each of the caller's faculty teaches this term — across ALL
// departments' schedules, because a CAS lecturer's GEC classes sit in the CIT and
// CTE schedules, not in CAS's. Same block shape as /api/rooms/occupancy (the
// System Logs "Faculty Occupancy" tab reuses that grid), grouped like buildings:
// one group per department.
//   DEAN / ADMIN — their own department's faculty (a Program Chairperson also sees
//                  the instructors allocated to their program)
//   SUPER_ADMIN  — their own faculty: the department, narrowed to their department
//                  head area when they have one (same rule as the Faculty page)
const ROLES = ["DEAN", "SUPER_ADMIN", "ADMIN"]

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    const dbUser = await getCurrentUser()
    if (!dbUser || !ROLES.includes(dbUser.role)) {
      return NextResponse.json(apiError("Only the Dean, Department Chairpersons and Program Chairpersons can view faculty occupancy"), { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const deptId = getUserDepartmentId(dbUser)
    if (!deptId) return NextResponse.json(apiResponse({ semester: null, buildings: [], departments: [] }))

    let semesterId = searchParams.get("semesterId")
    if (!semesterId) {
      const active =
        (await db.semester.findFirst({ where: { isActive: true }, select: { id: true } })) ??
        (await db.semester.findFirst({ orderBy: { academicYear: { startYear: "desc" } }, select: { id: true } }))
      semesterId = active?.id ?? null
    }
    const semester = semesterId
      ? await db.semester.findUnique({ where: { id: semesterId }, include: { academicYear: true } })
      : null
    if (!semester) return NextResponse.json(apiResponse({ semester: null, buildings: [], departments: [] }))

    const clusterId = dbUser.role === "SUPER_ADMIN" ? ((dbUser as any).clusterId ?? null) : null
    const allocatedIds =
      dbUser.role === "ADMIN"
        ? (await getProgramAllocations((dbUser as any).programHead?.programId, semester.id)).ids
        : []

    const faculty = await db.faculty.findMany({
      where: {
        OR: [
          { departmentId: deptId, ...(clusterId ? { clusterId } : {}), employeeId: { not: TBA_EMPLOYEE_ID } },
          ...(allocatedIds.length ? [{ id: { in: allocatedIds } }] : []),
        ],
      },
      select: {
        id: true, isActive: true, employmentType: true, maxUnitsPerWeek: true,
        user: { select: { firstName: true, lastName: true } },
        department: { select: { id: true, abbreviation: true, name: true } },
      },
      orderBy: { user: { lastName: "asc" } },
    })

    const entries = faculty.length
      ? await db.scheduleEntry.findMany({
          where: { facultyId: { in: faculty.map((f) => f.id) }, schedule: { semesterId: semester.id, isArchived: false } },
          select: {
            id: true, facultyId: true, day: true, startTime: true, endTime: true, set: true, mergeGroupId: true,
            subject: { select: { code: true, title: true, type: true } },
            section: { select: { name: true, yearLevel: { select: { program: { select: { abbreviation: true } } } } } },
            room: { select: { code: true } },
            schedule: {
              select: { id: true, status: true, department: { select: { id: true, abbreviation: true, name: true, college: { select: { abbreviation: true, name: true } } } } },
            },
          },
          orderBy: [{ day: "asc" }, { startTime: "asc" }],
        })
      : []

    const byFaculty = new Map<string, any[]>()
    const mergedIndex = new Map<string, any>()
    const departments = new Map<string, { id: string; abbreviation: string; name: string; college: string; collegeName: string }>()
    for (const e of entries) {
      const dept = e.schedule.department
      if (dept) departments.set(dept.id, { id: dept.id, abbreviation: dept.abbreviation, name: dept.name, college: dept.college?.abbreviation ?? "", collegeName: dept.college?.name ?? "" })
      const list = byFaculty.get(e.facultyId) ?? []
      const mergeKey = e.mergeGroupId ? `${e.facultyId}|${e.mergeGroupId}|${e.day}|${e.startTime}|${e.endTime}` : null
      if (mergeKey && mergedIndex.has(mergeKey)) {
        const block = mergedIndex.get(mergeKey)
        if (e.section?.name && !block.sections.includes(e.section.name)) block.sections.push(e.section.name)
        block.section = block.sections.join(" + ")
        continue
      }
      const block = {
        id: e.id, day: e.day, startTime: e.startTime, endTime: e.endTime, set: e.set, merged: !!e.mergeGroupId,
        subjectCode: e.subject?.code ?? "", subjectTitle: e.subject?.title ?? "", subjectType: e.subject?.type ?? "LECTURE",
        section: e.section?.name ?? "", sections: e.section?.name ? [e.section.name] : [],
        program: e.section?.yearLevel?.program?.abbreviation ?? "",
        faculty: "", room: e.room?.code ?? "",
        scheduleId: e.schedule.id, scheduleStatus: e.schedule.status,
        departmentId: dept?.id ?? "", department: dept?.abbreviation ?? "", departmentName: dept?.name ?? "",
      }
      if (mergeKey) mergedIndex.set(mergeKey, block)
      list.push(block)
      byFaculty.set(e.facultyId, list)
    }

    // One group per faculty department (allocated instructors from CAS get their own).
    const groups = new Map<string, any>()
    for (const f of faculty) {
      const d = f.department
      const gid = d?.id ?? "none"
      if (!groups.has(gid)) groups.set(gid, { id: gid, code: d?.abbreviation ?? "—", name: d?.name ?? "No department", restrictedTo: [], rooms: [] })
      const name = `${f.user.lastName}, ${f.user.firstName}`.trim()
      groups.get(gid).rooms.push({
        id: f.id,
        code: name,
        name: `${formatFacultyType(f.employmentType)} · ${f.maxUnitsPerWeek}u`,
        type: "faculty",
        isActive: f.isActive,
        occupancy: (byFaculty.get(f.id) ?? []).map((b) => ({ ...b, faculty: name })),
      })
    }

    return NextResponse.json(
      apiResponse({
        semester: { id: semester.id, type: semester.type, academicYear: semester.academicYear?.label ?? null },
        buildings: [...groups.values()],
        departments: [...departments.values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
      })
    )
  } catch (error) {
    console.error("GET /api/faculty/occupancy error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
