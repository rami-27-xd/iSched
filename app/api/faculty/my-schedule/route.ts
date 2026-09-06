import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

/**
 * GET /api/faculty/my-schedule
 *
 * Returns the CURRENT signed-in user's own PUBLISHED teaching schedule (a Dept or
 * Program Chair can also hold teaching assignments). Powers the "my teaching schedule"
 * widget on the dashboard. Faculty no longer log in, so this is only ever the signed-in
 * chair's own entries. PUBLISHED only — drafts never appear in a personal timetable.
 */
export async function GET() {
  try {
    const supabaseUser = await getAuthenticatedUser()
    if (!supabaseUser) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const user = await db.user.findUnique({
      where: { supabaseId: supabaseUser.id },
      include: { faculty: true },
    })

    if (!user?.faculty) {
      return NextResponse.json(apiResponse([]))
    }

    const entries = await db.scheduleEntry.findMany({
      where: {
        facultyId: user.faculty.id,
        schedule: { status: "PUBLISHED", isArchived: false },
      },
      include: {
        subject: true,
        room: { include: { building: true } },
        section: { include: { yearLevel: { include: { program: true } } } },
        schedule: {
          include: {
            semester: { include: { academicYear: true } },
            department: { include: { college: true } },
          },
        },
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    })

    return NextResponse.json(apiResponse(entries))
  } catch (error) {
    console.error("GET /api/faculty/my-schedule error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
