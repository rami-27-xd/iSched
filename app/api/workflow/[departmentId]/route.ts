// Workflow State API — manages the DepartmentWorkflowState lifecycle.
//
// Sequential state machine:
//   DRAFT → SUBMITTED_TO_CHAIR  (ADMIN / Program Chair only)
//   SUBMITTED_TO_CHAIR → UNDER_REVIEW  (set automatically when SUPER_ADMIN triggers generate)
//   UNDER_REVIEW → APPROVED | REJECTED  (SUPER_ADMIN / Department Chair only)
//   REJECTED → DRAFT  (ADMIN / Program Chair resets to revise)
//
// The GET endpoint is accessible to both roles so the UI can display
// the current state and lock/unlock the relevant action buttons.

import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { createNotification } from "@/lib/notifications"

type RouteParams = { params: Promise<{ departmentId: string }> }

// ── GET /api/workflow/[departmentId] ─────────────────────────────────────────
// Returns the workflow state for a given department + active semester.
// Query param ?semesterId=<id> overrides the active-semester default.
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { departmentId } = await params
    const { searchParams } = new URL(req.url)
    const semesterIdParam = searchParams.get("semesterId")

    // Resolve semester: explicit param or current active semester
    const semester = semesterIdParam
      ? await db.semester.findUnique({ where: { id: semesterIdParam } })
      : await db.semester.findFirst({ where: { isActive: true } })

    if (!semester) {
      return NextResponse.json(
        apiError("No active semester found. Pass ?semesterId= to specify one."),
        { status: 404 }
      )
    }

    // RBAC: Faculty can only see their own department's state.
    // ADMIN can only see their assigned department.
    // SUPER_ADMIN can see any department.
    if (dbUser.role !== "SUPER_ADMIN") {
      const userDeptId = dbUser.departmentId
      if (userDeptId !== departmentId) {
        return NextResponse.json(apiError("Access denied to this department"), { status: 403 })
      }
    }

    const state = await db.departmentWorkflowState.findUnique({
      where: {
        departmentId_semesterId: { departmentId, semesterId: semester.id },
      },
      include: {
        department: { select: { name: true, abbreviation: true } },
        semester: { select: { type: true } },
      },
    })

    if (!state) {
      // Return a virtual DRAFT state — no record means no submission yet
      return NextResponse.json(
        apiResponse({
          departmentId,
          semesterId: semester.id,
          status: "DRAFT",
          submittedBy: null,
          submittedAt: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
        })
      )
    }

    return NextResponse.json(apiResponse(state))
  } catch (error) {
    console.error("GET /api/workflow/[departmentId] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

// ── PATCH /api/workflow/[departmentId] ───────────────────────────────────────
// Transitions the workflow state. The allowed transitions are role-gated.
//
// Request body:
//   { action: "submit" | "approve" | "reject" | "reset", semesterId?: string, reviewNote?: string }
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { departmentId } = await params
    const body = await req.json()
    const { action, semesterId: semesterIdParam, reviewNote } = body as {
      action: "submit" | "approve" | "reject" | "reset"
      semesterId?: string
      reviewNote?: string
    }

    if (!action) {
      return NextResponse.json(apiError("action is required"), { status: 400 })
    }

    // Resolve semester
    const semester = semesterIdParam
      ? await db.semester.findUnique({ where: { id: semesterIdParam } })
      : await db.semester.findFirst({ where: { isActive: true } })

    if (!semester) {
      return NextResponse.json(apiError("No active semester found"), { status: 404 })
    }

    // RBAC checks per action
    if ((action === "submit" || action === "reset") && dbUser.role !== "ADMIN") {
      return NextResponse.json(
        apiError("Only Program Chairpersons (ADMIN) can submit or reset department data"),
        { status: 403 }
      )
    }
    if ((action === "approve" || action === "reject") && dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        apiError("Only Department Chairpersons (SUPER_ADMIN) can approve or reject submissions"),
        { status: 403 }
      )
    }

    // ADMIN scope check — Program Chair can only act on their own department
    if (dbUser.role === "ADMIN" && dbUser.departmentId !== departmentId) {
      return NextResponse.json(
        apiError("You can only manage workflow for your own department"),
        { status: 403 }
      )
    }

    if (action === "reject" && !reviewNote?.trim()) {
      return NextResponse.json(
        apiError("A rejection note is required when rejecting a submission"),
        { status: 400 }
      )
    }

    // Upsert the workflow state record
    const existing = await db.departmentWorkflowState.findUnique({
      where: {
        departmentId_semesterId: { departmentId, semesterId: semester.id },
      },
    })

    // Validate legal transitions
    const currentStatus = existing?.status ?? "DRAFT"
    const legalTransitions: Record<string, string[]> = {
      submit: ["DRAFT", "REJECTED"],
      approve: ["SUBMITTED_TO_CHAIR", "UNDER_REVIEW"],
      reject: ["SUBMITTED_TO_CHAIR", "UNDER_REVIEW"],
      reset: ["REJECTED"],
    }

    if (!legalTransitions[action]?.includes(currentStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot perform "${action}" from current status "${currentStatus}"`,
          currentStatus,
          allowedFrom: legalTransitions[action],
        },
        { status: 409 }
      )
    }

    // Using explicit Prisma enum values via type assertion — nextStatus is always
    // a valid DepartmentWorkflowStatus but the ternary produces `string`.
    type WfStatus = "DRAFT" | "SUBMITTED_TO_CHAIR" | "UNDER_REVIEW" | "APPROVED" | "REJECTED"
    const nextStatus = ({
      submit: "SUBMITTED_TO_CHAIR",
      approve: "APPROVED",
      reject: "REJECTED",
      reset: "DRAFT",
    } as Record<string, WfStatus>)[action]

    const now = new Date()
    // Build create and update payloads separately to satisfy Prisma's strict
    // discriminated-union types on the upsert operation.
    const baseFields =
      action === "submit"
        ? { status: nextStatus, submittedBy: dbUser.id, submittedAt: now, reviewNote: null as string | null }
        : action === "approve" || action === "reject"
        ? { status: nextStatus, reviewedBy: dbUser.id, reviewedAt: now, reviewNote: (reviewNote ?? null) as string | null }
        : { status: nextStatus, reviewNote: null as string | null }

    const updated = await db.departmentWorkflowState.upsert({
      where: {
        departmentId_semesterId: { departmentId, semesterId: semester.id },
      },
      create: { departmentId, semesterId: semester.id, ...baseFields },
      update: baseFields,
    })

    // Fetch department name separately — upsert include + spread create/update
    // causes Prisma TS narrowing issues; a follow-up select is cleaner.
    const dept = await db.department.findUnique({
      where: { id: departmentId },
      select: { name: true },
    })

    // ── Notifications ──────────────────────────────────────────────────────
    const deptName = dept?.name ?? departmentId

    if (action === "submit") {
      // Notify all Department Chairs (SUPER_ADMIN) so they know to review
      const chairs = await db.user.findMany({
        where: { role: "SUPER_ADMIN", isApproved: true, isActive: true },
      })
      await Promise.all(
        chairs.map((chair) =>
          createNotification({
            userId: chair.id,
            title: "Department Submitted for Review",
            message: `${deptName} has submitted their semester data and is ready for schedule generation.`,
            type: "workflow_submitted",
            link: `/dashboard/schedules`,
          })
        )
      )
    }

    if (action === "reject") {
      // Notify Program Chairs (ADMIN) in this department
      const programChairs = await db.user.findMany({
        where: { role: "ADMIN", departmentId, isApproved: true, isActive: true },
      })
      await Promise.all(
        programChairs.map((pc) =>
          createNotification({
            userId: pc.id,
            title: "Submission Rejected — Revision Required",
            message: `Your department submission for ${deptName} was rejected. ${reviewNote ? `Reason: ${reviewNote}` : ""}`,
            type: "workflow_rejected",
            link: `/dashboard/settings`,
          })
        )
      )
    }

    if (action === "approve") {
      const programChairs = await db.user.findMany({
        where: { role: "ADMIN", departmentId, isApproved: true, isActive: true },
      })
      await Promise.all(
        programChairs.map((pc) =>
          createNotification({
            userId: pc.id,
            title: "Schedule Approved",
            message: `The schedule for ${deptName} has been approved by the Department Chairperson.`,
            type: "workflow_approved",
            link: `/dashboard/schedules`,
          })
        )
      )
    }

    return NextResponse.json(
      apiResponse({
        status: updated.status,
        departmentId,
        semesterId: semester.id,
        updatedAt: updated.updatedAt,
      })
    )
  } catch (error) {
    console.error("PATCH /api/workflow/[departmentId] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
