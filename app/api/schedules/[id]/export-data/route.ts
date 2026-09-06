import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

/**
 * GET /api/schedules/[id]/export-data
 *
 * Returns a flat, enriched entry list plus header context for the two official
 * exports (Section 6): Schedule of Subjects (ISO) and Teaching Load. The main
 * schedule GET trims its entry select for list/calendar performance, so this
 * dedicated endpoint ships exactly the extra fields the exports need — units,
 * contact hours, program/year, and the faculty-name override — without bloating
 * every schedule fetch.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Only Department and Program Chairpersons can export schedules"), { status: 403 })
    }

    const { id } = await params

    // ADMIN (Program Chair) only sees their own department's sections, mirroring
    // the main schedule GET's scoping.
    const adminDeptId = dbUser.role === "ADMIN" ? getUserDepartmentId(dbUser) : null

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: {
        semester: { include: { academicYear: true } },
        department: { include: { college: true } },
        entries: {
          where: adminDeptId
            ? { section: { yearLevel: { program: { departmentId: adminDeptId } } } }
            : undefined,
          orderBy: [{ day: "asc" }, { startTime: "asc" }],
          select: {
            day: true,
            startTime: true,
            endTime: true,
            set: true,
            facultyName: true,
            subject: { select: { code: true, title: true, units: true, hoursPerWeek: true, type: true } },
            faculty: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
            room: { select: { code: true } },
            section: {
              select: {
                id: true,
                name: true,
                yearLevel: {
                  select: { level: true, program: { select: { name: true, abbreviation: true } } },
                },
              },
            },
          },
        },
      },
    })

    if (!schedule) return NextResponse.json(apiError("Schedule not found"), { status: 404 })

    // "Prepared by" pre-fill — the Program Chairperson who owns this schedule.
    const owner = await db.user.findUnique({
      where: { id: schedule.createdBy },
      select: { firstName: true, lastName: true },
    })

    const entries = schedule.entries.map((e: any) => ({
      subjectCode: e.subject?.code ?? "",
      subjectTitle: e.subject?.title ?? "",
      units: e.subject?.units ?? 0,
      contactHours: e.subject?.hoursPerWeek ?? 0,
      type: e.subject?.type ?? "LECTURE",
      facultyId: e.faculty?.id ?? "",
      // Free-text override wins, else the linked faculty's real name.
      facultyName: (e.facultyName?.trim() || `${e.faculty?.user?.firstName ?? ""} ${e.faculty?.user?.lastName ?? ""}`).trim(),
      roomCode: e.room?.code ?? "",
      sectionId: e.section?.id ?? "",
      sectionName: e.section?.name ?? "",
      programName: e.section?.yearLevel?.program?.name ?? "",
      programAbbr: e.section?.yearLevel?.program?.abbreviation ?? "",
      yearLevel: e.section?.yearLevel?.level ?? 1,
      day: e.day,
      startTime: e.startTime,
      endTime: e.endTime,
      set: e.set ?? null,
    }))

    return NextResponse.json(
      apiResponse({
        entries,
        header: {
          // Lets the export dialog offer the term-wide export (all departments in
          // this semester) without a second round trip to discover the semester.
          semesterId: schedule.semesterId,
          semesterType: schedule.semester?.type ?? null,
          academicYear: schedule.semester?.academicYear?.label ?? "",
          collegeName: schedule.department?.college?.name ?? "",
          collegeAbbr: schedule.department?.college?.abbreviation ?? "",
          departmentName: schedule.department?.name ?? "",
          startDate: schedule.semester?.startDate ?? null,
          status: schedule.status,
        },
        ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : "",
      })
    )
  } catch (error) {
    console.error("GET /api/schedules/[id]/export-data error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
