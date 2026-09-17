import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { recordAudit } from "@/lib/audit"

/**
 * Faculty building access — which buildings a faculty member may teach in,
 * recorded PER TERM (FacultyBuildingAvailability.semesterId), exactly like their
 * time availability. The generator and manual entry read the rows of the
 * schedule's own term only; a faculty member with no rows for a term has no
 * building restriction that term.
 *
 *   GET  ?semesterId=            → rows for the caller's department's faculty
 *   POST { facultyId, semesterId, buildingIds[] } → replaces that faculty's rows
 *                                  for the term (empty list = no restriction)
 */

// Same write rule as time availability (app/api/faculty/availability/route.ts):
// Department / Program Chairpersons, faculty of their own department, and a CAS
// cluster chair only their own cluster.
async function checkWriteAccess(facultyId: string): Promise<{ error: NextResponse | null; dbUser?: any; departmentId?: string | null }> {
  const dbUser = await getCurrentUser()
  if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
    return { error: NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 }) }
  }
  const target = await db.faculty.findUnique({ where: { id: facultyId }, select: { departmentId: true, clusterId: true } })
  if (!target) return { error: NextResponse.json(apiError("Faculty not found"), { status: 404 }) }

  const chairDeptId = getUserDepartmentId(dbUser)
  if (!chairDeptId || target.departmentId !== chairDeptId) {
    return { error: NextResponse.json(apiError("Forbidden — you can only manage faculty in your own department"), { status: 403 }) }
  }
  if (dbUser.role === "SUPER_ADMIN") {
    const chairClusterId = (dbUser as any).clusterId ?? null
    if (chairClusterId && target.clusterId && target.clusterId !== chairClusterId) {
      return { error: NextResponse.json(apiError("Forbidden — this faculty member belongs to a different cluster"), { status: 403 }) }
    }
  }
  return { error: null, dbUser, departmentId: target.departmentId }
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN", "DEAN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }
    const deptId = getUserDepartmentId(dbUser)
    if (!deptId) return NextResponse.json(apiResponse([]))

    const { searchParams } = new URL(req.url)
    const semesterId = searchParams.get("semesterId")
    if (!semesterId) return NextResponse.json(apiError("semesterId is required"), { status: 400 })

    const rows = await db.facultyBuildingAvailability.findMany({
      where: { semesterId, faculty: { departmentId: deptId } },
      select: { facultyId: true, buildingId: true },
    })
    return NextResponse.json(apiResponse(rows))
  } catch (error) {
    console.error("GET /api/faculty/building-availability error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const body = await req.json()
    const { facultyId, semesterId, buildingIds } = body as { facultyId?: string; semesterId?: string; buildingIds?: string[] }
    if (!facultyId || !semesterId || !Array.isArray(buildingIds)) {
      return NextResponse.json(apiError("facultyId, semesterId and buildingIds[] are required"), { status: 400 })
    }

    const access = await checkWriteAccess(facultyId)
    if (access.error) return access.error

    // Same precondition as time availability: the term must have an active
    // (non-archived) schedule in the faculty's department.
    const activeSchedule = await db.schedule.findFirst({
      where: { semesterId, isArchived: false, ...(access.departmentId ? { departmentId: access.departmentId } : {}) },
      select: { id: true },
    })
    if (!activeSchedule) {
      return NextResponse.json(
        apiError("No active schedule exists for this term in this department. Create one in Manage Schedules before setting building access."),
        { status: 409 }
      )
    }

    const validBuildings = buildingIds.length
      ? await db.building.findMany({ where: { id: { in: buildingIds } }, select: { id: true, name: true } })
      : []
    const ids = validBuildings.map((b) => b.id)

    await db.$transaction([
      db.facultyBuildingAvailability.deleteMany({ where: { facultyId, semesterId } }),
      ...(ids.length
        ? [db.facultyBuildingAvailability.createMany({ data: ids.map((buildingId) => ({ facultyId, semesterId, buildingId })) })]
        : []),
    ])

    const facultyRow = await db.faculty.findUnique({
      where: { id: facultyId },
      select: { departmentId: true, user: { select: { firstName: true, lastName: true } } },
    })
    await recordAudit({
      actor: access.dbUser,
      action: "availability.buildings",
      entityType: "availability",
      entityId: facultyId,
      departmentId: facultyRow?.departmentId ?? null,
      summary: `Set building access of ${facultyRow?.user?.firstName ?? ""} ${facultyRow?.user?.lastName ?? ""} (${ids.length ? validBuildings.map((b) => b.name).join(", ") : "no restriction"})`.trim(),
      metadata: {
        Faculty: `${facultyRow?.user?.firstName ?? ""} ${facultyRow?.user?.lastName ?? ""}`.trim(),
        Buildings: ids.length ? validBuildings.map((b) => b.name).join(", ") : "Any building",
      },
    })

    return NextResponse.json(apiResponse(ids.map((buildingId) => ({ facultyId, semesterId, buildingId }))), { status: 201 })
  } catch (error) {
    console.error("POST /api/faculty/building-availability error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
