/**
 * Schedule Workflow API
 * POST /api/schedules/[id]/workflow
 *
 * A department's schedule (spec 2026-09-26):
 *
 *     DRAFT  ──(submit: Program Chairperson)──►  PENDING_APPROVAL  ──(approve: Dean)──►  PUBLISHED
 *                                                                  ──(reject:  Dean)──►  DRAFT
 *     PUBLISHED ──(reset: Department Chairperson)──► DRAFT
 *
 * Roles:
 *   ADMIN (Program Chairperson) → submit their own department's DRAFT, and only
 *       once GEC/GEL is finalized AND every Program Chairperson of the department
 *       has marked their subjects as done (../program-finalize) — and the
 *       department has a Dean to approve it.
 *   DEAN                        → approve / reject (return with a note) a
 *       PENDING_APPROVAL schedule of their own department. Approve runs the same
 *       term-wide conflict check as Publish: a schedule never goes live while it
 *       double-books a room or lecturer with any department.
 *   SUPER_ADMIN (Dept Chair)    → reset a PUBLISHED schedule back to DRAFT. Their
 *       own CAS schedule has no Program Chairpersons and is published directly
 *       from ../publish, not through this route.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiResponse, apiError } from '@/lib/api-helpers'
import { recordAudit } from '@/lib/audit'
import { createNotification, notifyDepartmentDeans } from '@/lib/notifications'
import {
  isGecFinalized,
  GEC_FIRST_MESSAGE,
  getProgramFinalizationStatus,
  PROGRAMS_FIRST_MESSAGE,
} from '@/lib/services/workflow-gates'
import { detectTermConflicts } from '@/lib/services/term-conflicts'

type WorkflowAction = 'submit' | 'approve' | 'reject' | 'reset'

/** Approved, active Program Chairpersons of a department (linked via their program). */
async function programChairIds(departmentId: string | null): Promise<string[]> {
  if (!departmentId) return []
  const chairs = await db.user.findMany({
    where: { role: 'ADMIN', isApproved: true, isActive: true, programHead: { program: { departmentId } } },
    select: { id: true },
  })
  return chairs.map((c) => c.id)
}

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
        apiError('Only a Program Chairperson can submit a schedule for approval'),
        { status: 403 }
      )
    }
    if ((action === 'approve' || action === 'reject') && dbUser.role !== 'DEAN') {
      return NextResponse.json(
        apiError("Only the department's Dean can approve or return a schedule"),
        { status: 403 }
      )
    }
    if (action === 'reset' && dbUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        apiError('Only a Department Chairperson can reset a published schedule'),
        { status: 403 }
      )
    }
    if (action === 'reject' && !reviewNote?.trim()) {
      return NextResponse.json(
        apiError('A note is required when returning a schedule for revision'),
        { status: 400 }
      )
    }

    // ── Fetch schedule ─────────────────────────────────────────────────────
    const schedule = await db.schedule.findUnique({
      where: { id },
      include: {
        semester: { include: { academicYear: true } },
        department: { include: { college: true } },
      },
    })

    if (!schedule) {
      return NextResponse.json(apiError('Schedule not found'), { status: 404 })
    }

    // Submit / approve / reject act on the caller's OWN department only.
    if (action !== 'reset' && getUserDepartmentId(dbUser) !== schedule.departmentId) {
      return NextResponse.json(
        apiError('This schedule belongs to another department'),
        { status: 403 }
      )
    }

    // ── Validate state transition ──────────────────────────────────────────
    const allowedFrom: Record<WorkflowAction, string[]> = {
      submit:  ['DRAFT'],
      approve: ['PENDING_APPROVAL'],
      reject:  ['PENDING_APPROVAL'],
      // reset: Dept Chair sends a published schedule back to DRAFT so the Program
      // Chairpersons can regenerate (e.g. to restore entries lost to a generation issue).
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

    const deptName = schedule.department?.name ?? 'Unknown Department'
    const deptAbbr = schedule.department?.abbreviation ?? deptName
    const semTypeLabel = schedule.semester?.type === 'FIRST' ? '1st Semester' : schedule.semester?.type === 'SECOND' ? '2nd Semester' : 'Summer'
    const termLabel = `${semTypeLabel} ${schedule.semester?.academicYear?.label ?? ''}`.trim()
    const scheduleLink = `/dashboard/schedules?schedule=${id}`

    // ── Submit gates ───────────────────────────────────────────────────────
    if (action === 'submit') {
      // 1. GEC/GEL first — majors are built around the department heads' backbone.
      if (!(await isGecFinalized(id))) {
        return NextResponse.json(
          { success: false, error: 'Cannot submit yet', details: [GEC_FIRST_MESSAGE] },
          { status: 409 }
        )
      }
      // 2. Everyone in the department is done plotting.
      const programs = await getProgramFinalizationStatus(id, schedule.departmentId)
      if (!programs.allFinalized) {
        const waiting = programs.programs
          .filter((p) => !p.finalized)
          .map((p) => `${p.abbreviation}${p.chairs[0] ? ` (${p.chairs[0].name})` : ''}`)
        return NextResponse.json(
          {
            success: false,
            error: waiting.length
              ? `Cannot submit yet — still plotting: ${waiting.join(', ')}`
              : 'Cannot submit yet',
            details: [PROGRAMS_FIRST_MESSAGE],
          },
          { status: 409 }
        )
      }
      // 3. Someone must be able to approve it.
      const deanCount = await db.user.count({
        where: { role: 'DEAN', departmentId: schedule.departmentId, isApproved: true, isActive: true },
      })
      if (deanCount === 0) {
        return NextResponse.json(
          apiError(`${deptName} has no Dean account yet — the Dean approves this schedule. Ask your Dean to sign up first.`),
          { status: 409 }
        )
      }
    }

    // ── Approve gate: the same term-wide conflict check as Publish ─────────
    let warningConflicts: Awaited<ReturnType<typeof detectTermConflicts>>['conflicts'] = []
    if (action === 'approve') {
      const { conflicts } = await detectTermConflicts(id)
      const errorConflicts = conflicts.filter((c) => c.severity === 'ERROR')
      warningConflicts = conflicts.filter((c) => c.severity === 'WARNING')
      if (errorConflicts.length > 0) {
        // Record what was found so the Conflicts banner shows it; the Dean then
        // returns the schedule with a note for the Program Chairpersons to fix.
        await db.conflictLog.deleteMany({ where: { scheduleId: id } })
        await db.conflictLog.createMany({
          data: conflicts.map((c) => ({
            scheduleId: id,
            type: c.type,
            description: c.description,
            entityIds: c.entryIds ?? [],
          })),
        })
        return NextResponse.json(
          {
            success: false,
            error: `Cannot approve — ${errorConflicts.length} scheduling conflict${errorConflicts.length === 1 ? '' : 's'} (a room, lecturer or section booked twice). Return the schedule for revision.`,
            details: errorConflicts.slice(0, 5).map((c) => c.description),
          },
          { status: 422 }
        )
      }
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

    if (action === 'approve') {
      // Clean slate: the approve check found no blocking conflicts; keep the warnings.
      await db.conflictLog.deleteMany({ where: { scheduleId: id } })
      if (warningConflicts.length > 0) {
        await db.conflictLog.createMany({
          data: warningConflicts.map((c) => ({
            scheduleId: id,
            type: c.type,
            description: c.description,
            entityIds: c.entryIds ?? [],
          })),
        })
      }
    }

    // ── Notifications ──────────────────────────────────────────────────────
    const submitterName = `${dbUser.firstName} ${dbUser.lastName}`.trim()
    const chairIds = await programChairIds(schedule.departmentId)

    if (action === 'submit') {
      // The Dean approves it…
      await notifyDepartmentDeans(
        schedule.departmentId ?? '',
        'Schedule Submitted for Your Approval',
        `The ${deptName} schedule (${termLabel}) was submitted by ${submitterName}. Every Program Chairperson has marked their subjects as done — it is waiting for your approval.`,
        'workflow_submitted',
        scheduleLink
      )
      // …and the other Program Chairpersons learn it is now locked.
      await Promise.all(
        chairIds
          .filter((uid) => uid !== dbUser.id)
          .map((userId) =>
            createNotification({
              userId,
              title: 'Schedule Submitted to the Dean',
              message: `${submitterName} submitted the ${deptName} schedule (${termLabel}) for the Dean's approval. It is locked until the Dean decides.`,
              type: 'workflow_submitted',
              link: scheduleLink,
            })
          )
      )
    }

    if (action === 'approve') {
      await Promise.all(
        chairIds.map((userId) =>
          createNotification({
            userId,
            title: 'Schedule Approved ✓',
            message: `The Dean approved the ${deptName} schedule (${termLabel}). It is now published.`,
            type: 'workflow_approved',
            link: scheduleLink,
          })
        )
      )
      // The Department Chairpersons plotted GEC/GEL into it — tell them it is live.
      const deptChairs = await db.user.findMany({
        where: { role: 'SUPER_ADMIN', isApproved: true, isActive: true },
        select: { id: true },
      })
      await Promise.all(
        deptChairs.map((c) =>
          createNotification({
            userId: c.id,
            title: 'Schedule Published',
            message: `The Dean approved the ${deptName} schedule (${termLabel}); it is now published.`,
            type: 'schedule_published',
            link: scheduleLink,
          })
        )
      )
    }

    if (action === 'reject') {
      await Promise.all(
        chairIds.map((userId) =>
          createNotification({
            userId,
            title: 'Schedule Returned for Revision',
            message: `The Dean returned the ${deptName} schedule (${termLabel}). Reason: ${reviewNote?.trim()}`,
            type: 'workflow_rejected',
            link: scheduleLink,
          })
        )
      )
    }

    if (action === 'reset') {
      await Promise.all(
        chairIds.map((userId) =>
          createNotification({
            userId,
            title: 'Schedule Reset to Draft',
            message: `The ${deptName} schedule (${termLabel}) has been reset to Draft. Update it, mark your subjects as done and submit it again for the Dean's approval.`,
            type: 'workflow_rejected',
            link: scheduleLink,
          })
        )
      )
    }

    const auditAction = (
      { submit: 'schedule.submitted', approve: 'schedule.approved', reject: 'schedule.rejected', reset: 'schedule.reset' } as const
    )[action]
    await recordAudit({
      actor: dbUser as any,
      action: auditAction,
      entityType: 'schedule',
      entityId: id,
      departmentId: schedule.departmentId,
      scheduleId: id,
      summary:
        action === 'submit'
          ? `Submitted the ${deptAbbr} schedule for the Dean's approval`
          : action === 'approve'
            ? `Approved and published the ${deptAbbr} schedule`
            : action === 'reject'
              ? `Returned the ${deptAbbr} schedule for revision — ${reviewNote?.trim()}`
              : `Reset the ${deptAbbr} schedule to Draft`,
      metadata: {
        From: schedule.status,
        To: updated.status,
        Term: termLabel,
        ...(reviewNote?.trim() ? { Note: reviewNote.trim() } : {}),
      },
    })

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
