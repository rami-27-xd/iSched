import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

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
  if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
    return { error: NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 }) }
  }

  const target = await db.faculty.findUnique({
    where: { id: facultyId },
    select: { departmentId: true, clusterId: true },
  })
  if (!target) {
    return { error: NextResponse.json(apiError("Faculty not found"), { status: 404 }) }
  }

  if (dbUser.role === "ADMIN" || dbUser.role === "SUPER_ADMIN") {
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
          apiError("Forbidden — this faculty member belongs to a different cluster"),
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

    // Same role scoping as the write path: only chairs manage/view availability.
    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const facultyId = searchParams.get("facultyId")
    const semesterId = searchParams.get("semesterId")

    const where: any = {}
    if (facultyId) where.facultyId = facultyId
    if (semesterId) where.semesterId = semesterId

    // ADMIN (Program Chair) — scoped to faculty within their own department only
    if (dbUser.role === "ADMIN") {
      const adminDeptId = getUserDepartmentId(dbUser)
      if (!adminDeptId) return NextResponse.json(apiResponse([]))
      where.faculty = { departmentId: adminDeptId }
    }

    const availability = await db.facultyAvailability.findMany({
      where,
      include: {
        faculty: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
        semester: { include: { academicYear: true } },
      },
      orderBy: [{ faculty: { user: { lastName: "asc" } } }, { day: "asc" }, { startTime: "asc" }],
    })

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

    return NextResponse.json(apiResponse(updated), { status: 201 })
  } catch (error) {
    console.error("POST /api/faculty/availability error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
