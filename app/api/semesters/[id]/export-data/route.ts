import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

/**
 * GET /api/semesters/[id]/export-data
 *
 * Term-wide counterpart to /api/schedules/[id]/export-data: the same flat entry
 * shape, but scoped by FACULTY OWNERSHIP rather than by schedule.
 *
 * Why it exists: a Department Chairperson's faculty teach across departments — a
 * CAS lecturer's GEC classes live in the CIT and CTE schedules, not in CAS's. A
 * Teaching Load exported from a single schedule therefore shows only the slice of
 * that person's load that happens to sit in the chair's own timetable. On live data
 * a Social Sciences chair's faculty had 166 entries this term, 108 of them inside
 * another department's schedule.
 *
 * So this walks every non-archived schedule in the semester but keeps only the
 * entries taught by faculty the chair owns. The ownership rule is the same one
 * checkFacultyWriteAccess uses in /api/faculty/[id]: the chair's department, and —
 * when they head a cluster — that cluster. A chair with no cluster keeps dept-wide
 * scope.
 *
 * SUPER_ADMIN only. A Program Chairperson is scoped to their own department and has
 * no business exporting another college's timetable.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        apiError("Only the Department Chairperson can export a whole semester across departments"),
        { status: 403 }
      )
    }

    const { id } = await params

    const semester = await db.semester.findUnique({
      where: { id },
      include: { academicYear: true },
    })
    if (!semester) return NextResponse.json(apiError("Semester not found"), { status: 404 })

    // Which faculty does this chair own? Same rule as checkFacultyWriteAccess.
    const chairDeptId = getUserDepartmentId(dbUser)
    if (!chairDeptId) {
      return NextResponse.json(
        apiError("Your account has no department assigned, so there are no faculty to export"),
        { status: 400 }
      )
    }
    const chairClusterId = (dbUser as any).clusterId ?? null
    const ownFacultyWhere = {
      departmentId: chairDeptId,
      ...(chairClusterId ? { clusterId: chairClusterId } : {}),
    }

    const schedules = await db.schedule.findMany({
      where: { semesterId: id, isArchived: false },
      include: {
        department: { include: { college: true } },
        entries: {
          // The whole point: keep only classes taught by THIS chair's faculty,
          // wherever in the term they happen to be scheduled.
          where: { faculty: ownFacultyWhere },
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

    const entries = schedules.flatMap((s: any) =>
      s.entries.map((e: any) => ({
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
        // Term-wide only: which department's schedule this entry came from, so the
        // chair can see at a glance that a lecturer's load spans several.
        departmentAbbr: s.department?.abbreviation ?? "",
      }))
    )

    const owner = await db.user.findUnique({
      where: { id: dbUser.id },
      select: { firstName: true, lastName: true },
    })

    // Only schedules that actually contain this chair's faculty are worth naming.
    const contributing = schedules.filter((s: any) => s.entries.length > 0)

    const chairDept = await db.department.findUnique({
      where: { id: chairDeptId },
      include: { college: true },
    })
    const cluster = chairClusterId
      ? await db.facultyCluster.findUnique({ where: { id: chairClusterId }, select: { name: true } })
      : null

    // How many of the chair's faculty exist vs. actually hold a class this term —
    // the difference is the ones with nothing scheduled yet.
    const ownFacultyTotal = await db.faculty.count({ where: ownFacultyWhere })
    const teaching = new Set(entries.map((e) => e.facultyId).filter(Boolean)).size
    const unpublished = contributing.filter((s: any) => s.status !== "PUBLISHED").length

    return NextResponse.json(
      apiResponse({
        entries,
        header: {
          semesterType: semester.type ?? null,
          academicYear: semester.academicYear?.label ?? "",
          collegeName: chairDept?.college?.name ?? "",
          collegeAbbr: chairDept?.college?.abbreviation ?? "",
          departmentName: cluster?.name ?? chairDept?.name ?? "",
          startDate: semester.startDate ?? null,
          // Only counts the schedules this chair's faculty actually appear in.
          status: unpublished === 0 && contributing.length > 0 ? "PUBLISHED" : "DRAFT",
        },
        ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : "",
        scopeLabel: cluster?.name ?? chairDept?.name ?? "your department",
        facultyTotal: ownFacultyTotal,
        facultyTeaching: teaching,
        scheduleCount: contributing.length,
        departments: contributing.map((s: any) => ({
          abbreviation: s.department?.abbreviation ?? "",
          name: s.department?.name ?? "",
          status: s.status,
          entryCount: s.entries.length,
        })),
      })
    )
  } catch (error) {
    console.error("GET /api/semesters/[id]/export-data error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
