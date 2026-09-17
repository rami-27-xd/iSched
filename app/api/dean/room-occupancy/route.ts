import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { PLACEHOLDER_ROOM_CODES } from "@/lib/sentinels"

// GET /api/dean/room-occupancy?semesterId=
// Dean only (RBAC spec §1 — System Logs: "who occupies each room within their
// building"). Buildings are the ones assigned to the Dean's department
// (DepartmentBuilding); every class held in their rooms this semester is listed,
// whichever department's schedule it comes from — that is exactly the point:
// the Dean sees outside departments using their rooms too.
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "DEAN") {
      return NextResponse.json(apiError("Only the Dean can view room occupancy"), { status: 403 })
    }
    const deptId = getUserDepartmentId(dbUser)
    if (!deptId) return NextResponse.json(apiResponse({ semester: null, buildings: [] }))

    const { searchParams } = new URL(req.url)
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
    if (!semester) return NextResponse.json(apiResponse({ semester: null, buildings: [] }))

    const buildings = await db.building.findMany({
      where: { departments: { some: { departmentId: deptId } } },
      include: {
        rooms: {
          where: { code: { notIn: [...PLACEHOLDER_ROOM_CODES] } },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true, type: true, isActive: true },
        },
      },
      orderBy: { name: "asc" },
    })
    const roomIds = buildings.flatMap((b) => b.rooms.map((r) => r.id))
    if (roomIds.length === 0) {
      return NextResponse.json(
        apiResponse({
          semester: { id: semester.id, type: semester.type, academicYear: semester.academicYear?.label ?? null },
          buildings: buildings.map((b) => ({ id: b.id, code: b.code, name: b.name, rooms: [] })),
        })
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
        facultyName: true,
        subject: { select: { code: true, title: true } },
        section: { select: { name: true } },
        faculty: { select: { employeeId: true, user: { select: { firstName: true, lastName: true } } } },
        schedule: {
          select: {
            id: true,
            status: true,
            department: { select: { abbreviation: true, name: true } },
          },
        },
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    })

    const byRoom = new Map<string, any[]>()
    for (const e of entries) {
      const list = byRoom.get(e.roomId) ?? []
      list.push({
        id: e.id,
        day: e.day,
        startTime: e.startTime,
        endTime: e.endTime,
        set: e.set,
        subjectCode: e.subject?.code ?? "",
        subjectTitle: e.subject?.title ?? "",
        section: e.section?.name ?? "",
        faculty:
          e.facultyName ??
          (e.faculty?.user ? `${e.faculty.user.firstName} ${e.faculty.user.lastName}`.trim() : e.faculty?.employeeId ?? "—"),
        scheduleId: e.schedule.id,
        scheduleStatus: e.schedule.status,
        department: e.schedule.department?.abbreviation ?? "",
        departmentName: e.schedule.department?.name ?? "",
      })
      byRoom.set(e.roomId, list)
    }

    return NextResponse.json(
      apiResponse({
        semester: { id: semester.id, type: semester.type, academicYear: semester.academicYear?.label ?? null },
        buildings: buildings.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          rooms: b.rooms.map((r) => ({ ...r, occupancy: byRoom.get(r.id) ?? [] })),
        })),
      })
    )
  } catch (error) {
    console.error("GET /api/dean/room-occupancy error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
