import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, canManageBuilding } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const room = await db.room.findUnique({
      where: { id },
      include: { building: true, _count: { select: { scheduleEntries: true } } },
    })

    if (!room) return NextResponse.json(apiError("Room not found"), { status: 404 })
    return NextResponse.json(apiResponse(room))
  } catch (error) {
    console.error("GET /api/rooms/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const { name, code, buildingId, type, capacity, equipment, isActive, restrictedDepartmentIds, restrictedProgramIds } = body

    // ADMIN (Program Chair) is locked to their own college: may only manage rooms
    // in buildings already scoped to their college, and cannot move a room into
    // (or out of) a building outside their college.
    if (dbUser.role === "ADMIN") {
      const existing = await db.room.findUnique({ where: { id }, select: { buildingId: true } })
      if (!existing) return NextResponse.json(apiError("Room not found"), { status: 404 })
      if (!(await canManageBuilding(dbUser, existing.buildingId))) {
        return NextResponse.json(
          apiError("Forbidden — you can only manage rooms in your own college"),
          { status: 403 }
        )
      }
      if (buildingId !== undefined && buildingId !== existing.buildingId && !(await canManageBuilding(dbUser, buildingId))) {
        return NextResponse.json(
          apiError("Forbidden — you can only move rooms into buildings in your own college"),
          { status: 403 }
        )
      }
    }

    const room = await db.room.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(buildingId !== undefined ? { buildingId } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
        ...(equipment !== undefined ? { equipment } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(restrictedDepartmentIds !== undefined
          ? {
              departments: {
                deleteMany: {},
                create: (restrictedDepartmentIds as string[]).map((departmentId) => ({ departmentId })),
              },
            }
          : {}),
        ...(restrictedProgramIds !== undefined
          ? {
              programs: {
                deleteMany: {},
                create: (restrictedProgramIds as string[]).map((programId) => ({ programId })),
              },
            }
          : {}),
      },
      include: {
        building: true,
        departments: { include: { department: true } },
        programs: { include: { program: { select: { id: true, name: true, abbreviation: true } } } },
      },
    })

    return NextResponse.json(apiResponse(room))
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json(apiError("Room not found"), { status: 404 })
    console.error("PATCH /api/rooms/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const { id } = await params

    if (dbUser.role === "ADMIN") {
      const existing = await db.room.findUnique({ where: { id }, select: { buildingId: true } })
      if (!existing) return NextResponse.json(apiError("Room not found"), { status: 404 })
      if (!(await canManageBuilding(dbUser, existing.buildingId))) {
        return NextResponse.json(
          apiError("Forbidden — you can only manage rooms in your own college"),
          { status: 403 }
        )
      }
    }

    await db.room.delete({ where: { id } })
    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json(apiError("Room not found"), { status: 404 })
    console.error("DELETE /api/rooms/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
