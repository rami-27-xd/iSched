import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

// Public endpoint — no auth required. Returns departments (with their programs)
// for the sign-up form, where a Program Chairperson picks the program they head.
export async function GET() {
  try {
    const departments = await db.department.findMany({
      include: {
        college: { select: { name: true, abbreviation: true } },
        programs: {
          select: { id: true, name: true, abbreviation: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(apiResponse(departments))
  } catch (error) {
    console.error("GET /api/departments/public error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
