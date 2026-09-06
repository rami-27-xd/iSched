import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    const userDeptId = getUserDepartmentId(dbUser)

    const { searchParams } = new URL(req.url)
    const programId = searchParams.get("programId")
    const yearLevelId = searchParams.get("yearLevelId")

    // SUPER_ADMIN (Department Chair) can see ALL sections across departments
    // because they handle GEC subjects that apply to all programs
    const isSuperAdmin = dbUser?.role === "SUPER_ADMIN"

    const sections = await db.section.findMany({
      where: {
        ...(yearLevelId ? { yearLevelId } : {}),
        ...(programId ? { yearLevel: { programId } } : {}),
        // Department isolation only for non-super-admin roles
        ...(!isSuperAdmin && userDeptId && !programId && !yearLevelId
          ? { yearLevel: { program: { departmentId: userDeptId } } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        yearLevelId: true,
        yearLevel: {
          select: {
            level: true,
            programId: true,
            program: {
              select: {
                id: true,
                abbreviation: true,
                departmentId: true,
                department: { select: { college: { select: { abbreviation: true } } } },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(apiResponse(sections))
  } catch (error) {
    console.error("GET /api/sections error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    // Only SUPER_ADMIN and ADMIN can create sections
    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const body = await req.json()
    const { name, yearLevelId, capacity } = body

    if (!name || !yearLevelId) {
      return NextResponse.json(apiError("Missing required fields"), { status: 400 })
    }

    const section = await db.section.create({
      data: {
        name,
        yearLevelId,
        capacity: capacity ? Number(capacity) : 40,
      },
      include: {
        yearLevel: {
          include: { program: { include: { department: true } } },
        },
      },
    })

    return NextResponse.json(apiResponse(section), { status: 201 })
  } catch (error) {
    console.error("POST /api/sections error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
