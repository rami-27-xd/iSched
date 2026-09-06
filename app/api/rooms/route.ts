import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, canManageBuilding } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")
    const buildingId = searchParams.get("buildingId")
    const collegeId = searchParams.get("collegeId")

    // Department-building restriction filter:
    // When ?departmentId=X is passed, only return rooms whose building is mapped
    // to that department via DepartmentBuilding. This enforces the rule that users
    // can only choose rooms in buildings assigned to their department.
    const departmentId = searchParams.get("departmentId")

    let allowedBuildingIds: string[] | undefined

    if (departmentId) {
      const mappings = await db.departmentBuilding.findMany({
        where: { departmentId },
        select: { buildingId: true },
      })
      allowedBuildingIds = mappings.map((m) => m.buildingId)
      // If the department has no building mappings, return all (fallback for legacy data)
      if (allowedBuildingIds.length === 0) {
        allowedBuildingIds = undefined
      }
    }

    // Handle comma-separated type values (e.g. type=LABORATORY,COMPUTER_LAB)
    const typeFilter = type
      ? type.includes(",")
        ? { in: type.split(",") as any[] }
        : (type as any)
      : undefined

    // The "TBA" sentinel (code "TBA") is included regardless of the type/
    // building/department filters above — it's the placeholder a chair picks
    // in Add/Edit Entry to resolve an Unassigned Queue item when no real room
    // is available, so it must be selectable no matter what room type or
    // department is being filtered for.
    const rooms = await db.room.findMany({
      where: {
        OR: [
          {
            isActive: true,
            ...(typeFilter ? { type: typeFilter } : {}),
            ...(buildingId ? { buildingId } : {}),
            ...(allowedBuildingIds ? { buildingId: { in: allowedBuildingIds } } : {}),
          },
          { code: "TBA" },
        ],
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        buildingId: true,
        isActive: true,
        labSpecialization: true,
        building: { select: { code: true, name: true } },
        departments: { select: { departmentId: true } },
        programs: { select: { programId: true } },
      },
      orderBy: [{ building: { name: "asc" } }, { name: "asc" }],
    })

    return NextResponse.json(apiResponse(rooms))
  } catch (error) {
    console.error("GET /api/rooms error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const body = await req.json()
    const { name, code, buildingId, type, equipment, restrictedDepartmentIds, restrictedProgramIds } = body

    if (!name || !code || !buildingId || !type) {
      return NextResponse.json(apiError("name, code, buildingId, and type are required"), { status: 400 })
    }

    // ADMIN (Program Chair) is locked to their own college: they may only add
    // rooms to buildings that already belong to their own college.
    if (dbUser.role === "ADMIN" && !(await canManageBuilding(dbUser, buildingId))) {
      return NextResponse.json(
        apiError("Forbidden — you can only add rooms to buildings in your own college"),
        { status: 403 }
      )
    }

    const deptIds: string[] = Array.isArray(restrictedDepartmentIds) ? restrictedDepartmentIds : []
    const programIds: string[] = Array.isArray(restrictedProgramIds) ? restrictedProgramIds : []

    const room = await db.room.create({
      data: {
        name,
        code,
        buildingId,
        type,
        equipment: equipment ?? [],
        ...(deptIds.length > 0
          ? { departments: { create: deptIds.map((departmentId) => ({ departmentId })) } }
          : {}),
        ...(programIds.length > 0
          ? { programs: { create: programIds.map((programId) => ({ programId })) } }
          : {}),
      },
      include: {
        building: true,
        departments: { include: { department: true } },
        programs: { include: { program: { select: { id: true, name: true, abbreviation: true } } } },
      },
    })

    return NextResponse.json(apiResponse(room), { status: 201 })
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(apiError("A room with this code already exists"), { status: 409 })
    }
    console.error("POST /api/rooms error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
