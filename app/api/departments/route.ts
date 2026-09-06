import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { searchParams } = new URL(req.url)
    const collegeId = searchParams.get("collegeId")

    const departments = await db.department.findMany({
      where: { ...(collegeId ? { collegeId } : {}) },
      include: {
        college: true,
        programs: {
          select: { id: true, name: true, abbreviation: true },
          orderBy: { abbreviation: "asc" },
        },
        _count: { select: { faculty: true, subjects: true, programs: true } },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(apiResponse(departments))
  } catch (error) {
    console.error("GET /api/departments error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
