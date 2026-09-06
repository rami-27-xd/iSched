import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    const departmentId = getUserDepartmentId(dbUser)

    const { searchParams } = new URL(req.url)
    const semesterId = searchParams.get("semesterId")
    const status = searchParams.get("status")
    const isArchived = searchParams.get("isArchived") === "true"
    // Cluster-scope filter: only return schedules from departments in this cluster
    const clusterIdParam = searchParams.get("clusterId")
    // College filter: scope to a specific college (SUPER_ADMIN college switcher)
    const collegeIdParam = searchParams.get("collegeId")

    // Build where clause
    // College filter applies only to SUPER_ADMIN (they use the topbar switcher).
    // ADMIN gets unrestricted visibility so they can participate in the workflow.
    const isAdmin = dbUser?.role === "ADMIN"
    const where: any = {
      isArchived,
      ...(semesterId ? { semesterId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(!isAdmin && collegeIdParam ? { department: { collegeId: collegeIdParam } } : {}),
    }

    if (dbUser?.role === "ADMIN") {
      // ADMIN (Program Chair): sees all schedules including those from all colleges.
      // They need visibility of Dept Chair schedules to know when Phase 1 is complete,
      // and their own generated schedules are visible to all Dept Chairs for conflict review.
      // No status or department restriction — full read access for workflow participation.
    } else if (dbUser?.role === "SUPER_ADMIN") {
      // SUPER_ADMIN (Dept Chair): full visibility across ALL colleges and statuses.
      // They must be able to review every Program Chair's schedule to detect and
      // resolve room double-bookings across different programs (compliance requirement).
      // Optional college filter via topbar switcher; null = all colleges.
      if (collegeIdParam) {
        where.department = { collegeId: collegeIdParam }
      }
    } else {
      // FACULTY: scope to own department
      if (departmentId) where.departmentId = departmentId
    }

    const schedules = await db.schedule.findMany({
      where,
      include: {
        semester: { include: { academicYear: true } },
        department: {
          include: {
            college: { select: { name: true, abbreviation: true } },
            cluster: { select: { id: true, name: true } },
          },
        },
        _count: { select: { entries: true, conflicts: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200, // Defensive cap — avoids unbounded scans as schedules accumulate across semesters
    })

    return NextResponse.json(apiResponse(schedules))
  } catch (error) {
    console.error("GET /api/schedules error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser) {
      return NextResponse.json(apiError("User not found"), { status: 404 })
    }

    // Both SUPER_ADMIN (Dept Chair) and ADMIN (Program Chair) can create schedules.
    // Dept Chairs create GEC schedules (Phase 1); Program Chairs create major-subject
    // schedules (Phase 2), which Dept Chairs can then review for room conflicts.
    if (!["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Only Department Chairs and Program Chairs can create schedules"), { status: 403 })
    }

    const body = await req.json()
    const {
      semesterType, schoolYear, startDate: startDateStr, endDate: endDateStr,
      departmentId: requestedDepartmentId,
    } = body

    // Which department this schedule is for.
    //   SUPER_ADMIN (Dept Chair) — may create a schedule for ANY department.
    //     Under the inverted workflow they go FIRST (plotting GEC/GEL into each
    //     department's schedule), so the schedule has to exist before that
    //     department's Program Chair ever opens it. Defaults to their own
    //     department when none is specified.
    //   ADMIN (Program Chair) — always locked to their own department; a
    //     requested departmentId is ignored rather than honoured.
    const ownDepartmentId = getUserDepartmentId(dbUser)
    let departmentId: string | null = ownDepartmentId

    if (dbUser.role === "SUPER_ADMIN" && requestedDepartmentId) {
      const target = await db.department.findUnique({
        where: { id: requestedDepartmentId },
        select: { id: true },
      })
      if (!target) {
        return NextResponse.json(apiError("The selected department no longer exists"), { status: 400 })
      }
      departmentId = target.id
    }

    if (!departmentId) {
      return NextResponse.json(apiError("You must be assigned to a department to create schedules"), { status: 400 })
    }

    if (!semesterType || !schoolYear) {
      return NextResponse.json(apiError("Semester type and school year are required"), { status: 400 })
    }

    // Parse school year — must be two CONSECUTIVE years (e.g. 2025-2026). A typo
    // like "2025-2025" previously parsed as "valid" and silently created a brand
    // new AcademicYear/Semester/Schedule instead of reusing the real one, leaving
    // an orphaned empty schedule that looked like the user's real one had vanished.
    const [startYear, endYear] = schoolYear.split("-").map(Number)
    if (!startYear || !endYear) {
      return NextResponse.json(apiError("Invalid school year format. Use YYYY-YYYY"), { status: 400 })
    }
    if (endYear !== startYear + 1) {
      return NextResponse.json(
        apiError(`"${schoolYear}" isn't a valid school year — the second year must be exactly one year after the first (e.g. 2025-2026).`),
        { status: 400 }
      )
    }

    // Find or create academic year
    let academicYear = await db.academicYear.findUnique({
      where: { label: schoolYear },
    })
    if (!academicYear) {
      academicYear = await db.academicYear.create({
        data: { label: schoolYear, startYear, endYear, isCurrent: false },
      })
    }

    // Find or create semester
    let semester = await db.semester.findUnique({
      where: { type_academicYearId: { type: semesterType, academicYearId: academicYear.id } },
    })
    if (!semester) {
      const startDate = startDateStr
        ? new Date(startDateStr)
        : semesterType === "FIRST" ? new Date(`${startYear}-08-01`) : new Date(`${endYear}-01-06`)
      const endDate = endDateStr
        ? new Date(endDateStr)
        : semesterType === "FIRST" ? new Date(`${startYear}-12-15`) : new Date(`${endYear}-05-15`)
      semester = await db.semester.create({
        data: {
          type: semesterType,
          academicYearId: academicYear.id,
          startDate,
          endDate,
          isActive: false,
        },
      })
    } else if (startDateStr && endDateStr) {
      semester = await db.semester.update({
        where: { id: semester.id },
        data: {
          startDate: new Date(startDateStr),
          endDate: new Date(endDateStr),
        },
      })
    }

    // Academic-year guard: once this department has active schedules for BOTH
    // the 1st and 2nd semester of a school year, that year is fully covered —
    // refuse to create any more for it. Adjusting the start/end dates must not
    // be a way around this: those dates only ever update the existing Semester
    // rows (see above), they never produce a new semester, so without this check
    // a different date could still land you on an already-covered year.
    const yearSchedules = await db.schedule.findMany({
      where: {
        departmentId,
        isArchived: false,
        semester: { academicYearId: academicYear.id },
      },
      select: { semester: { select: { type: true } } },
    })
    const coveredTypes = new Set(yearSchedules.map((s) => s.semester?.type))
    if (coveredTypes.has("FIRST") && coveredTypes.has("SECOND")) {
      return NextResponse.json(
        apiError(
          `${schoolYear} is already fully scheduled for this department — both the 1st and 2nd semester schedules exist. Open one of them from the list, or archive one first if you need to start over.`
        ),
        { status: 409 }
      )
    }

    // Prevent accidental duplicates: an active (non-archived) schedule already
    // covers this exact department + semester — surface it instead of silently
    // creating a second, disconnected one that would bury the real entries.
    const existingActive = await db.schedule.findFirst({
      where: { departmentId, semesterId: semester.id, isArchived: false },
      select: { id: true, status: true },
    })
    if (existingActive) {
      return NextResponse.json(
        apiError(`A schedule for this department and semester already exists (status: ${existingActive.status}). Select it from the list instead of creating a new one.`),
        { status: 409 }
      )
    }

    const schedule = await db.schedule.create({
      data: {
        semesterId: semester.id,
        departmentId,
        createdBy: dbUser.id,
      },
      include: {
        semester: { include: { academicYear: true } },
        department: true,
        _count: { select: { entries: true } },
      },
    })

    return NextResponse.json(apiResponse(schedule), { status: 201 })
  } catch (error) {
    console.error("POST /api/schedules error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
