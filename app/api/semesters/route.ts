import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(_req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const semesters = await db.semester.findMany({
      include: { academicYear: true },
      orderBy: [{ academicYear: { startYear: "desc" } }, { type: "asc" }],
    })

    return NextResponse.json(apiResponse(semesters))
  } catch (error) {
    console.error("GET /api/semesters error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
