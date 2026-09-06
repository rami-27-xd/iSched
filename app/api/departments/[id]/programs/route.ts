import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params

    const programs = await db.program.findMany({
      where: { departmentId: id },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(apiResponse(programs))
  } catch (error) {
    console.error("GET /api/departments/[id]/programs error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
