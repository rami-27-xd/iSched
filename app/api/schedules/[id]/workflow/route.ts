/**
 * Schedule Workflow API
 * POST /api/schedules/[id]/workflow
 *
 * Two-phase workflow:
 *
 *   Phase 1 (Dept Chair / SUPER_ADMIN):
 *     DRAFT  ──(approve)──►  PUBLISHED   ← signals Phase 1 complete; unlocks Program Chairs
 *
 *   Phase 2 (Program Chair / ADMIN):
 *     DRAFT  ──(submit)──►  PENDING_APPROVAL  ──(approve)──►  PUBLISHED
 *                                             ──(reject)───►  DRAFT
 *
 * Roles:
 *   ADMIN (Program Chair)     → submit a DRAFT schedule for Dept Chair conflict review
 *   SUPER_ADMIN (Dept Chair)  → approve from DRAFT (Phase 1) or PENDING_APPROVAL (Phase 2 review)
 *                               reject from PENDING_APPROVAL (returns ADMIN to DRAFT)
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiResponse, apiError } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

type WorkflowAction = 'submit' | 'approve' | 'reject' | 'reset'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError('Unauthorized'), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser) return NextResponse.json(apiError('Unauthorized'), { status: 401 })

    const { id } = await params
    const body = await req.json()
    const { action, reviewNote } = body as { action: WorkflowAction; reviewNote?: string }

    if (!action || !['submit', 'approve', 'reject', 'reset'].includes(action)) {
      return NextResponse.json(
        apiError('Invalid action. Must be: submit | approve | reject | reset'),
        { status: 400 }
      )
    }

    // ── Role checks ────────────────────────────────────────────────────────
    if (action === 'submit' && dbUser.role !== 'ADMIN') {
      return NextResponse.json(
        apiError('Only Program Chairpersons (ADMIN) can submit schedules for review'),
        { status: 403 }
      )
    }
    if ((action === 'approve' || action === 'reject' || action === 'reset') && dbUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        apiError('Only Department Chairpersons (SUPER_ADMIN) can approve, reject, or reset schedules'),
        { status: 403 }
      )
    }
    if (action === 'reject' && !reviewNote?.trim()) {
      return NextResponse.json(
        apiError('A rejection note is required when rejecting a schedule'),
        { status: 400 }
      )
    }

    // ── Fetch schedule ─────────────────────────────────────────────────────
    const schedule = await db.schedule.findUnique({
      where: { id },
      include: {
        semester: true,
        department: { include: { college: true } },
      },
    })

    if (!schedule) {
      return NextResponse.json(apiError('Schedule not found'), { status: 404 })
    }

    // ── Validate state transition ──────────────────────────────────────────
    const allowedFrom: Record<WorkflowAction, string[]> = {
      submit:  ['DRAFT'],
      approve: ['DRAFT', 'PENDING_APPROVAL'],
      reject:  ['PENDING_APPROVAL'],
      // reset: Dept Chair sends a published schedule back to DRAFT so the Program Chair
      // can regenerate (e.g. to restore entries lost due to a generation issue).
      reset:   ['PUBLISHED'],
    }

    if (!allowedFrom[action].includes(schedule.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot "${action}" a schedule that is currently "${schedule.status}"`,
          currentStatus: schedule.status,
          allowedFrom: allowedFrom[action],
        },
        { status: 409 }
      )
    }

    // ── Apply transition ───────────────────────────────────────────────────
    const nextStatus: Record<WorkflowAction, string> = {
      submit:  'PENDING_APPROVAL',
      approve: 'PUBLISHED',
      reject:  'DRAFT',
      reset:   'DRAFT',
    }

    const updateData: Record<string, any> = {
      status: nextStatus[action],
    }

    if (action === 'approve') {
      updateData.publishedAt = new Date()
      updateData.rejectionReason = null
    }

    if (action === 'reject') {
      updateData.rejectionReason = reviewNote
    }

    if (action === 'submit' || action === 'reset') {
      updateData.rejectionReason = null
    }

    const updated = await db.schedule.update({
      where: { id },
      data: updateData,
    })

    // ── Notifications ──────────────────────────────────────────────────────
    const semTypeLabel = schedule.semester?.type === 'FIRST' ? '1st Semester' : schedule.semester?.type === 'SECOND' ? '2nd Semester' : 'Summer'
    const semLabel = `${semTypeLabel} · ${schedule.department?.college?.abbreviation ?? ''}`
    const deptName = schedule.department?.name ?? 'Unknown Department'

    if (action === 'submit') {
      // Notify all SUPER_ADMINs in the department that a schedule is waiting
      const chairs = await db.user.findMany({
        where: { role: 'SUPER_ADMIN', isApproved: true, isActive: true },
      })
      await Promise.all(
        chairs.map((chair) =>
          createNotification({
            userId: chair.id,
            title: 'Schedule Submitted for Review',
            message: `A schedule for ${deptName} (${semLabel}) is awaiting your approval.`,
            type: 'workflow_submitted',
            link: '/dashboard/schedules',
          })
        )
      )
    }

    if (action === 'approve') {
      // Notify all ADMINs in the department that their schedule was approved
      const admins = await db.user.findMany({
        where: {
          role: 'ADMIN',
          isApproved: true,
          isActive: true,
          departmentId: schedule.departmentId ?? undefined,
        },
      })
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.id,
            title: 'Schedule Approved ✓',
            message: `The schedule for ${deptName} (${semLabel}) has been approved and published to the master calendar.`,
            type: 'workflow_approved',
            link: '/dashboard/schedules',
          })
        )
      )
    }

    if (action === 'reject') {
      const admins = await db.user.findMany({
        where: {
          role: 'ADMIN',
          isApproved: true,
          isActive: true,
          departmentId: schedule.departmentId ?? undefined,
        },
      })
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.id,
            title: 'Schedule Returned for Revision',
            message: `The schedule for ${deptName} (${semLabel}) was returned. ${reviewNote ? `Reason: ${reviewNote}` : ''}`,
            type: 'workflow_rejected',
            link: '/dashboard/schedules',
          })
        )
      )
    }

    if (action === 'reset') {
      const admins = await db.user.findMany({
        where: {
          role: 'ADMIN',
          isApproved: true,
          isActive: true,
          departmentId: schedule.departmentId ?? undefined,
        },
      })
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.id,
            title: 'Schedule Reset to Draft',
            message: `The schedule for ${deptName} (${semLabel}) has been reset to Draft. Please regenerate and resubmit.`,
            type: 'workflow_rejected',
            link: '/dashboard/schedules',
          })
        )
      )
    }

    return NextResponse.json(
      apiResponse({
        scheduleId: id,
        previousStatus: schedule.status,
        newStatus: updated.status,
        action,
        reviewNote: action === 'reject' ? reviewNote : undefined,
      })
    )
  } catch (error) {
    console.error('POST /api/schedules/[id]/workflow error:', error)
    return NextResponse.json(apiError('Internal server error'), { status: 500 })
  }
}
