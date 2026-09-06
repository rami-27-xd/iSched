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
