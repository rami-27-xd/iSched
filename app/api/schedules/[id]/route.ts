import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    const { id } = await params

    // ADMIN (Program Chair): only see entries for sections in their department
    // e.g. CIT Program Chair sees all CIT sections (BSIT-Garm, BSInfoTech, etc.)
    // but NOT entries for CAS or CTE sections. Pushed into the query's `where`
    // (rather than filtered in JS after fetching) so Postgres/Prisma never joins
    // or serializes the rows being discarded.
    const adminDeptId = dbUser?.role === "ADMIN" ? getUserDepartmentId(dbUser) : null

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: {
        semester: { include: { academicYear: true } },
        department: true,
        entries: {
          where: adminDeptId
            ? { section: { yearLevel: { program: { departmentId: adminDeptId } } } }
            : undefined,
          // Explicit order so Postgres row order is stable across identical repeated
          // queries — otherwise React Query's structural sharing can't tell an
          // unchanged result from a changed one and every dependent memo recomputes.
          orderBy: [{ day: "asc" }, { startTime: "asc" }],
          // Select exactly what the client (schedules page, analytics page) reads —
          // the previous `include: true` on each relation shipped full nested rows
          // (full User, full Room incl. equipment/labSpecialization, full Program)
          // that were never rendered.
          select: {
            id: true,
            day: true,
            startTime: true,
            endTime: true,
            set: true,
            createdBy: true,
            subjectId: true,
            facultyId: true,
            roomId: true,
            sectionId: true,
            // programId/program.clusterId: needed client-side to mirror
            // checkSubjectEditPermission's cluster-ownership check (canEditEntry
            // in schedules/page.tsx) so the edit/delete affordance isn't shown for
            // an entry the API would reject anyway.
            subject: { select: { id: true, code: true, title: true, type: true, programId: true, program: { select: { clusterId: true } } } },
            faculty: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
            room: { select: { id: true, code: true } },
            section: { select: { id: true, name: true } },
          },
        },
        conflicts: true,
        // Unassigned Queue is scoped to whoever RAN the generate that produced
        // each row — a shared schedule can receive generate runs from multiple
        // chairs (Dept Chair's GEC pass, a Program Chair's major-load pass), and
        // each chair sees only the failures they caused, not everyone's.
        // Rows from before this scoping existed have generatedBy: null and are
        // simply invisible now (no owner to attribute them to) rather than
        // shown to everyone — the correct side to err on for exposure.
        unassigned: {
          where: { generatedBy: dbUser?.id ?? "__none__" },
          include: {
            subject: { select: { id: true, code: true, title: true, units: true, type: true, year: true } },
            section: { select: { id: true, name: true, yearLevel: { select: { level: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    })

    if (!schedule) {
      return NextResponse.json(apiError("Schedule not found"), { status: 404 })
    }

    // A Program Chair is scoped to their own department. Entry rows were already
    // filtered above, but the schedule shell itself was returned for ANY id, so a
    // guessed or shared URL still exposed another department schedule (its owner,
    // term and workflow status). Refuse it outright instead.
    if (adminDeptId && schedule.departmentId && schedule.departmentId !== adminDeptId) {
      return NextResponse.json(
        apiError("This schedule belongs to another department"),
        { status: 403 }
      )
    }

    return NextResponse.json(apiResponse(schedule))
  } catch (error) {
    console.error("GET /api/schedules/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Only Department and Program Chairpersons can modify schedules"), { status: 403 })
    }

    const { id } = await params
    const body = await req.json()

    const isSuperAdmin = dbUser.role === "SUPER_ADMIN"

    // Ownership — a Program Chair may only act on a schedule in their OWN department.
    const target = await db.schedule.findUnique({ where: { id }, select: { departmentId: true } })
    if (!target) return NextResponse.json(apiError("Schedule not found"), { status: 404 })
    const ownsSchedule = isSuperAdmin || (!!target.departmentId && getUserDepartmentId(dbUser) === target.departmentId)

    // Archive / unarchive — Dept Chair (any schedule) or Program Chair (own department).
    if (body.action === "archive") {
      if (!ownsSchedule) {
        return NextResponse.json(apiError("You can only archive schedules in your own department"), { status: 403 })
      }
      const schedule = await db.schedule.update({
        where: { id },
        data: { isArchived: true, status: "ARCHIVED" },
      })
      return NextResponse.json(apiResponse(schedule))
    }

    if (body.action === "unarchive") {
      if (!ownsSchedule) {
        return NextResponse.json(apiError("You can only restore schedules in your own department"), { status: 403 })
      }
      const schedule = await db.schedule.update({
        where: { id },
        data: { isArchived: false, status: "DRAFT" },
      })
      return NextResponse.json(apiResponse(schedule))
    }

    // Correct the term on a DRAFT schedule — semester, academic year, and dates.
    // Previously the only way to fix a typo in the school year or a wrong start
    // date was to delete the schedule and start over, losing every entry.
    if (body.action === "update-term") {
      if (!ownsSchedule) {
        return NextResponse.json(apiError("You can only edit schedules in your own department"), { status: 403 })
      }

      const schedule = await db.schedule.findUnique({
        where: { id },
        select: { status: true, departmentId: true, semesterId: true },
      })
      if (!schedule) return NextResponse.json(apiError("Schedule not found"), { status: 404 })
      // Only while it is still a draft — once submitted or published, other people
      // are reading these dates.
      if (schedule.status !== "DRAFT") {
        return NextResponse.json(
          apiError(`The term can only be changed while the schedule is a draft (this one is ${schedule.status}).`),
          { status: 400 }
        )
      }

      const { semesterType, schoolYear, startDate: startStr, endDate: endStr } = body
      if (!semesterType || !schoolYear || !startStr || !endStr) {
        return NextResponse.json(apiError("Semester, school year, start date and end date are all required"), { status: 400 })
      }

      // Same school-year validation the create route applies.
      const normalized = String(schoolYear).trim().replace(/[\s_]+/, "-")
      const m = normalized.match(/^(\d{4})-(\d{4})$/)
      if (!m) {
        return NextResponse.json(apiError("School year must look like 2025-2026"), { status: 400 })
      }
      const startYear = Number(m[1])
      const endYear = Number(m[2])
      if (endYear !== startYear + 1) {
        return NextResponse.json(apiError("School year must span two consecutive years, e.g. 2025-2026"), { status: 400 })
      }
      if (new Date(startStr) >= new Date(endStr)) {
        return NextResponse.json(apiError("End date must be after the start date"), { status: 400 })
      }

      let academicYear = await db.academicYear.findUnique({ where: { label: normalized } })
      if (!academicYear) {
        academicYear = await db.academicYear.create({
          data: { label: normalized, startYear, endYear, isCurrent: false },
        })
      }

      let semester = await db.semester.findUnique({
        where: { type_academicYearId: { type: semesterType, academicYearId: academicYear.id } },
      })

      // Moving to a different term? Re-apply the create route's guard so editing
      // can't sidestep the "this year is already fully scheduled" rule.
      if (!semester || semester.id !== schedule.semesterId) {
        const covered = await db.schedule.findMany({
          where: {
            departmentId: schedule.departmentId,
            isArchived: false,
            id: { not: id },
            semester: { academicYearId: academicYear.id },
          },
          select: { semester: { select: { type: true } } },
        })
        if (covered.some((s: any) => s.semester?.type === semesterType)) {
          return NextResponse.json(
            apiError(`This department already has a ${semesterType === "FIRST" ? "1st" : semesterType === "SECOND" ? "2nd" : "Summer"} semester schedule for ${normalized}.`),
            { status: 409 }
          )
        }
      }

      if (!semester) {
        semester = await db.semester.create({
          data: {
            type: semesterType,
            academicYearId: academicYear.id,
            startDate: new Date(startStr),
            endDate: new Date(endStr),
            isActive: false,
          },
        })
      } else {
        // The Semester row is shared by every department scheduling that term, so
        // a date correction here applies to all of them — which is right, a term
        // has one set of dates.
        semester = await db.semester.update({
          where: { id: semester.id },
          data: { startDate: new Date(startStr), endDate: new Date(endStr) },
        })
      }

      const updated = await db.schedule.update({
        where: { id },
        data: { semesterId: semester.id },
        include: { semester: { include: { academicYear: true } } },
      })
      return NextResponse.json(apiResponse(updated))
    }

    // Everything below (unpublish, approval-status changes) stays Department-Chair-only.
    if (!isSuperAdmin) {
      return NextResponse.json(
        apiError("Only the Department Chairperson can change a schedule's approval status"),
        { status: 403 }
      )
    }

    if (body.action === "unpublish") {
      const schedule = await db.schedule.findUnique({ where: { id } })
      if (!schedule || schedule.status !== "PUBLISHED") {
        return NextResponse.json(apiError("Schedule is not published"), { status: 400 })
      }
      const updated = await db.schedule.update({
        where: { id },
        data: { status: "DRAFT", publishedAt: null },
      })
      return NextResponse.json(apiResponse(updated))
    }

    // Handle status update
    const schedule = await db.schedule.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.status === "PUBLISHED" ? { publishedAt: new Date() } : {}),
      },
    })

    return NextResponse.json(apiResponse(schedule))
  } catch (error) {
    console.error("PATCH /api/schedules/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Only Department and Program Chairpersons can delete schedules"), { status: 403 })
    }

    const { id } = await params

    // A Program Chair may only delete a schedule in their OWN department.
    if (dbUser.role === "ADMIN") {
      const target = await db.schedule.findUnique({ where: { id }, select: { departmentId: true } })
      if (!target) return NextResponse.json(apiError("Schedule not found"), { status: 404 })
      const myDept = getUserDepartmentId(dbUser)
      if (!myDept || target.departmentId !== myDept) {
        return NextResponse.json(apiError("You can only delete schedules in your own department"), { status: 403 })
      }
    }

    await db.schedule.delete({ where: { id } })

    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error) {
    console.error("DELETE /api/schedules/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
