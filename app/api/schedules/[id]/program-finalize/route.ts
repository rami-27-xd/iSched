import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { getProgramFinalizationStatus, isGecFinalized, GEC_FIRST_MESSAGE } from "@/lib/services/workflow-gates"
import { createNotification } from "@/lib/notifications"
import { recordAudit } from "@/lib/audit"
import { isUniversityWideRole } from "@/lib/roles"

// "Done plotting" declarations of a department's Program Chairpersons for one
// schedule (model ProgramFinalization). The department's schedule can be
// submitted for the Dean's approval only once every one of them is done — see
// the submit gate in ../workflow/route.ts.

// GET — per-program status for the schedule's department:
//   { programs: [{ programId, abbreviation, name, chairs, finalized, finalizedBy, finalizedAt }],
//     done, total, allFinalized }
// Readable by whoever can see the schedule: its department's Dean and Program
// Chairpersons, and the university-wide roles.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    const dbUser = await getCurrentUser()
    if (!dbUser) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const schedule = await db.schedule.findUnique({ where: { id }, select: { id: true, departmentId: true } })
    if (!schedule) return NextResponse.json(apiError("Schedule not found"), { status: 404 })

    if (!isUniversityWideRole(dbUser.role) && getUserDepartmentId(dbUser) !== schedule.departmentId) {
      return NextResponse.json(apiError("Forbidden — this schedule belongs to another department"), { status: 403 })
    }

    return NextResponse.json(apiResponse(await getProgramFinalizationStatus(id, schedule.departmentId)))
  } catch (error) {
    console.error("GET /api/schedules/[id]/program-finalize error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

// POST { action: "finalize" | "unfinalize" }
//   Program Chairperson (ADMIN) only, for their OWN program, on a DRAFT schedule
//   of their own department. Marking done additionally needs GEC/GEL finalized —
//   before that a chairperson cannot have placed their full load yet.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(apiError("Only a Program Chairperson can mark their subjects as done"), { status: 403 })
    }

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = (body as { action?: string }).action
    if (action !== "finalize" && action !== "unfinalize") {
      return NextResponse.json(apiError('action must be "finalize" or "unfinalize"'), { status: 400 })
    }

    const program = (dbUser as any).programHead?.program as { id: string; abbreviation: string; departmentId: string } | undefined
    if (!program) {
      return NextResponse.json(apiError("Your account is not linked to a program yet — ask your Dean to assign it."), { status: 400 })
    }

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: { department: { select: { id: true, abbreviation: true, name: true } } },
    })
    if (!schedule) return NextResponse.json(apiError("Schedule not found"), { status: 404 })
    if (schedule.departmentId !== program.departmentId) {
      return NextResponse.json(apiError("This schedule belongs to another department"), { status: 403 })
    }
    if (schedule.status !== "DRAFT") {
      return NextResponse.json(
        apiError(
          schedule.status === "PENDING_APPROVAL"
            ? "This schedule has already been submitted for the Dean's approval."
            : "Only a Draft schedule can be changed. Ask the Dean to return it first."
        ),
        { status: 409 }
      )
    }

    const deptLabel = schedule.department?.abbreviation ?? "this schedule"

    if (action === "unfinalize") {
      const removed = await db.programFinalization.deleteMany({ where: { scheduleId: id, programId: program.id } })
      if (removed.count > 0) {
        await recordAudit({
          actor: dbUser as any,
          action: "schedule.programReopened",
          entityType: "schedule",
          entityId: id,
          departmentId: schedule.departmentId,
          scheduleId: id,
          summary: `${program.abbreviation} reopened its subjects in the ${deptLabel} schedule`,
          metadata: { Program: program.abbreviation },
        })
      }
      return NextResponse.json(apiResponse(await getProgramFinalizationStatus(id, schedule.departmentId)))
    }

    if (!(await isGecFinalized(id))) {
      return NextResponse.json(
        { success: false, error: "GEC/GEL is not finalized yet", details: [GEC_FIRST_MESSAGE] },
        { status: 409 }
      )
    }

    const before = await getProgramFinalizationStatus(id, schedule.departmentId)
    await db.programFinalization.upsert({
      where: { scheduleId_programId: { scheduleId: id, programId: program.id } },
      update: { finalizedBy: dbUser.id, finalizedAt: new Date() },
      create: { scheduleId: id, programId: program.id, finalizedBy: dbUser.id },
    })
    const status = await getProgramFinalizationStatus(id, schedule.departmentId)

    await recordAudit({
      actor: dbUser as any,
      action: "schedule.programFinalized",
      entityType: "schedule",
      entityId: id,
      departmentId: schedule.departmentId,
      scheduleId: id,
      summary: `${program.abbreviation} marked its subjects as done in the ${deptLabel} schedule (${status.done} of ${status.total} programs done)`,
      metadata: { Program: program.abbreviation, "Programs done": `${status.done} of ${status.total}` },
    })

    // The last one in: tell every Program Chairperson of the department that
    // the schedule can now be submitted for the Dean's approval.
    if (status.allFinalized && !before.allFinalized) {
      const chairIds = [...new Set(status.programs.flatMap((p) => p.chairs.map((c) => c.id)))]
      for (const userId of chairIds) {
        await createNotification({
          userId,
          title: "Everyone Is Done — Ready to Submit",
          message: `Every Program Chairperson of ${schedule.department?.name ?? deptLabel} has marked their subjects as done. The schedule can now be submitted for the Dean's approval.`,
          type: "workflow_approved",
          link: `/dashboard/schedules?schedule=${id}`,
        })
      }
      await recordAudit({
        actor: dbUser as any,
        action: "schedule.programsAllFinalized",
        entityType: "schedule",
        entityId: id,
        departmentId: schedule.departmentId,
        scheduleId: id,
        summary: `All ${status.total} Program Chairpersons of ${deptLabel} are done — ready to submit for the Dean's approval`,
      })
    }

    return NextResponse.json(apiResponse(status))
  } catch (error) {
    console.error("POST /api/schedules/[id]/program-finalize error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
