import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { PLACEHOLDER_ROOM_CODES } from "@/lib/sentinels"

// GET /api/rooms/occupancy?semesterId=[&buildingId=]
// Every class held this semester in a set of rooms, whichever department's
// schedule it comes from — that is the point: outside departments using your
// rooms show up too. Which buildings:
//   DEAN        — the buildings assigned to their department (DepartmentBuilding)
//   ADMIN (PC)  — the buildings their department may use: shared (no department
//                 links) or linked to it — the same union rule the generator and
//                 manual entry apply
//   SUPER_ADMIN — every building (their work spans every college)
// `buildingId` narrows any of the above to one building. The response lists the
// departments present so the UI can draw a colour key (lib/department-colors.ts).
const OCCUPANCY_ROLES = ["DEAN", "SUPER_ADMIN", "ADMIN"]

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !OCCUPANCY_ROLES.includes(dbUser.role)) {
      return NextResponse.json(apiError("Only the Dean, Department Chairpersons and Program Chairpersons can view room occupancy"), { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const isUniversityWide = dbUser.role === "SUPER_ADMIN"
    const ownDeptId = getUserDepartmentId(dbUser)
    const scopeDeptId = isUniversityWide ? null : ownDeptId
    const buildingId = searchParams.get("buildingId") || null
    if (!isUniversityWide && !scopeDeptId) {
      return NextResponse.json(apiResponse({ semester: null, buildings: [], departments: [] }))
    }

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

    // Building scope per role (see header comment).
    const buildingWhere: any =
      dbUser.role === "DEAN"
        ? { departments: { some: { departmentId: scopeDeptId! } } }
        : scopeDeptId
          ? { OR: [{ departments: { none: {} } }, { departments: { some: { departmentId: scopeDeptId } } }] }
          : {}
    if (buildingId) buildingWhere.id = buildingId

    const buildings = await db.building.findMany({
      where: buildingWhere,
      include: {
        departments: { select: { department: { select: { abbreviation: true } } } },
        rooms: {
          where: { code: { notIn: [...PLACEHOLDER_ROOM_CODES] } },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true, type: true, isActive: true },
        },
      },
      orderBy: { name: "asc" },
    })
    const roomIds = buildings.flatMap((b) => b.rooms.map((r) => r.id))
    const shapeBuilding = (b: (typeof buildings)[number], occ: Map<string, any[]>) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      restrictedTo: b.departments.map((d) => d.department.abbreviation),
      rooms: b.rooms.map((r) => ({ ...r, occupancy: occ.get(r.id) ?? [] })),
    })
    const semesterOut = { id: semester.id, type: semester.type, academicYear: semester.academicYear?.label ?? null }
    if (roomIds.length === 0) {
      return NextResponse.json(
        apiResponse({ semester: semesterOut, buildings: buildings.map((b) => shapeBuilding(b, new Map())), departments: [] })
      )
    }

    const entries = await db.scheduleEntry.findMany({
      where: {
        roomId: { in: roomIds },
        schedule: { semesterId: semester.id, isArchived: false },
      },
      select: {
        id: true,
        roomId: true,
        day: true,
        startTime: true,
        endTime: true,
        set: true,
        mergeGroupId: true,
        facultyName: true,
        subject: { select: { code: true, title: true, type: true } },
        section: { select: { name: true, yearLevel: { select: { program: { select: { abbreviation: true } } } } } },
        faculty: { select: { employeeId: true, user: { select: { firstName: true, lastName: true } } } },
        schedule: {
          select: {
            id: true,
            status: true,
            department: { select: { id: true, abbreviation: true, name: true, college: { select: { abbreviation: true, name: true } } } },
          },
        },
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    })

    // Merged NSTP sections (one row per section, same room/time) collapse into
    // one occupancy block listing every section.
    const byRoom = new Map<string, any[]>()
    const mergedIndex = new Map<string, any>()
    const departments = new Map<string, { id: string; abbreviation: string; name: string; college: string; collegeName: string }>()
    for (const e of entries) {
      const dept = e.schedule.department
      if (dept) departments.set(dept.id, { id: dept.id, abbreviation: dept.abbreviation, name: dept.name, college: dept.college?.abbreviation ?? "", collegeName: dept.college?.name ?? "" })
      const list = byRoom.get(e.roomId) ?? []
      const mergeKey = e.mergeGroupId ? `${e.roomId}|${e.mergeGroupId}|${e.day}|${e.startTime}|${e.endTime}` : null
      if (mergeKey && mergedIndex.has(mergeKey)) {
        const block = mergedIndex.get(mergeKey)
        if (e.section?.name && !block.sections.includes(e.section.name)) block.sections.push(e.section.name)
        block.section = block.sections.join(" + ")
        continue
      }
      const block = {
        id: e.id,
        day: e.day,
        startTime: e.startTime,
        endTime: e.endTime,
        set: e.set,
        merged: !!e.mergeGroupId,
        subjectCode: e.subject?.code ?? "",
        subjectTitle: e.subject?.title ?? "",
        subjectType: e.subject?.type ?? "LECTURE",
        section: e.section?.name ?? "",
        sections: e.section?.name ? [e.section.name] : [],
        program: e.section?.yearLevel?.program?.abbreviation ?? "",
        faculty:
          e.facultyName ??
          (e.faculty?.user ? `${e.faculty.user.firstName} ${e.faculty.user.lastName}`.trim() : e.faculty?.employeeId ?? "—"),
        scheduleId: e.schedule.id,
        scheduleStatus: e.schedule.status,
        departmentId: dept?.id ?? "",
        department: dept?.abbreviation ?? "",
        departmentName: dept?.name ?? "",
      }
      if (mergeKey) mergedIndex.set(mergeKey, block)
      list.push(block)
      byRoom.set(e.roomId, list)
    }

    return NextResponse.json(
      apiResponse({
        semester: semesterOut,
        buildings: buildings.map((b) => shapeBuilding(b, byRoom)),
        departments: [...departments.values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
      })
    )
  } catch (error) {
    console.error("GET /api/rooms/occupancy error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
