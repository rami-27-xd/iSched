'use client'

/**
 * WorkflowActions — shows the correct action buttons based on the current user's
 * role and the schedule's status.
 *
 * Real flow (see CLAUDE.md "Scheduling Workflow" — INVERTED per the 2026-08-28
 * spec update). For another college's schedule (isOwnSchedule=false — the normal
 * case for a Program Chair's own department):
 *   Step 1 (CIT Program Chair only): pre-plots LABORATORY subjects only, before
 *     GEC exists — hard-blocked server-side to labs-only until then.
 *   Step 2 (Dept Chair / SUPER_ADMIN): generates GEC/GEL into this schedule.
 *     NOT gated on any Program Chair submission — this is the FIRST step now,
 *     not the second. Already-plotted CIT labs are treated as locked slots.
 *   Step 3 (Dept Chair): finalizes/publishes the GEC/GEL schedule.
 *   Step 4 (Program Chair / ADMIN): once GEC exists, adds their full major load
 *     (lecture + lab) on DRAFT, then Submits for Review → PENDING_APPROVAL.
 *   Step 5 (Dept Chair): Approve/Reject the submission.
 *
 * The Dept Chair's OWN CAS schedule (isOwnSchedule=true) has no separate Program
 * Chair to wait on — the "CAS special case" — so they generate cluster majors/GEC
 * and Publish directly from DRAFT, no submit/approve step. This is the SAME
 * generate-first capability as the "other college" case above, not a special
 * exemption from a gate — there is no PC-submission gate to be exempt from.
 *
 * ┌────────────────────────────────────┬────────────────────────────────────────┐
 * │ Role / Status / Schedule           │ Visible Buttons / Banner                │
 * ├────────────────────────────────────┼────────────────────────────────────────┤
 * │ SUPER_ADMIN + DRAFT (own CAS)      │ Generate → Publish info banner          │
 * │ SUPER_ADMIN + DRAFT (other college)│ Generate → Publish info banner          │
 * │ SUPER_ADMIN + PENDING              │ [Approve ✓]  [Reject ✗]                 │
 * │ SUPER_ADMIN + PUBLISHED            │ Published banner                        │
 * │ ADMIN + DRAFT                      │ [Submit for Review]                     │
 * │ ADMIN + PENDING_APPROVAL           │ Locked banner — "Awaiting dept. review" │
 * └────────────────────────────────────┴────────────────────────────────────────┘
 */

import * as React from 'react'
import { CheckCircle2, SendHorizontal, XCircle, Clock, ShieldCheck, AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'

// ── Types ─────────────────────────────────────────────────────────────────

export interface WorkflowActionsProps {
  scheduleId: string
  status: string          // current ScheduleStatus
  userRole: string        // 'SUPER_ADMIN' | 'ADMIN' | 'FACULTY'
  departmentName?: string
  /**
   * True when this is the Dept Chair's own (CAS) schedule — false when they're
   * viewing another college's Program Chair schedule. Under the current workflow
   * order (spec Section 2) the Dept Chair generates/injects GEC FIRST for either
   * kind of schedule — there is no longer a "Program Chair must submit first" gate.
   * This flag now only distinguishes own-vs-injecting for scoping/labelling.
   */
  isOwnSchedule?: boolean
  /**
   * Count of unresolved, blocking ConflictLog rows (LOAD_EXCEEDED warnings
   * excluded, matching what the server allows through on approve). When > 0,
   * the Approve button on a PENDING_APPROVAL schedule is disabled so the Dept
   * Chair resolves conflicts before publishing.
   */
  unresolvedConflictCount?: number
  onStatusChange?: (newStatus: string) => void
}

// ── API helper ────────────────────────────────────────────────────────────

async function callWorkflow(
  scheduleId: string,
  action: 'submit' | 'approve' | 'reject' | 'reset',
  reviewNote?: string
) {
  const res = await fetch(`/api/schedules/${scheduleId}/workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reviewNote }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Request failed')
  return json.data
}

// ── Component ─────────────────────────────────────────────────────────────

export function WorkflowActions({
  scheduleId,
  status,
  userRole,
  departmentName,
  isOwnSchedule = true,
  unresolvedConflictCount = 0,
  onStatusChange,
}: WorkflowActionsProps) {
  const queryClient = useQueryClient()
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [reviewNote, setReviewNote] = React.useState('')

  // Shared mutation invalidator
  function invalidate(newStatus: string) {
    queryClient.invalidateQueries({ queryKey: ['schedules'] })
    queryClient.invalidateQueries({ queryKey: ['schedule', scheduleId] })
    onStatusChange?.(newStatus)
  }

  // ── Submit (ADMIN: DRAFT → PENDING_APPROVAL) ───────────────────────────
  const submitMutation = useMutation({
    mutationFn: () => callWorkflow(scheduleId, 'submit'),
    onSuccess: (data) => {
      toast.success('Schedule submitted for review', {
        description: 'The Department Chairperson has been notified.',
        duration: 5000,
      })
      invalidate('PENDING_APPROVAL')
    },
    onError: (err: Error) => {
      toast.error('Submission failed', { description: err.message })
    },
  })

  // ── Approve (SUPER_ADMIN: PENDING_APPROVAL → PUBLISHED) ───────────────
  const approveMutation = useMutation({
    mutationFn: () => callWorkflow(scheduleId, 'approve'),
    onSuccess: () => {
      toast.success('Schedule approved and published', {
        description: 'The schedule is now live on the master calendar.',
        duration: 5000,
      })
      invalidate('PUBLISHED')
    },
    onError: (err: Error) => {
      toast.error('Approval failed', { description: err.message })
    },
  })

  // ── Reject (SUPER_ADMIN: PENDING_APPROVAL → DRAFT) ────────────────────
  const rejectMutation = useMutation({
    mutationFn: () => callWorkflow(scheduleId, 'reject', reviewNote),
    onSuccess: () => {
      toast.info('Schedule returned for revision', {
        description: 'The Program Chairperson has been notified.',
        duration: 5000,
      })
      setRejectOpen(false)
      setReviewNote('')
      invalidate('DRAFT')
    },
    onError: (err: Error) => {
      toast.error('Rejection failed', { description: err.message })
    },
  })

  // ── Reset (SUPER_ADMIN: PUBLISHED → DRAFT) ────────────────────────────
  const resetMutation = useMutation({
    mutationFn: () => callWorkflow(scheduleId, 'reset'),
    onSuccess: () => {
      toast.info('Schedule reset to Draft', {
        description: 'The Program Chairperson can now regenerate and resubmit.',
        duration: 5000,
      })
      invalidate('DRAFT')
    },
    onError: (err: Error) => {
      toast.error('Reset failed', { description: err.message })
    },
  })

  const isBusy = submitMutation.isPending || approveMutation.isPending || rejectMutation.isPending || resetMutation.isPending

  // ── ADMIN view ────────────────────────────────────────────────────────

  if (userRole === 'ADMIN') {
    if (status === 'DRAFT') {
      return (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={isBusy}
            className="bg-[#1B4332] hover:bg-[#2D6A4F] text-white gap-2"
          >
            {submitMutation.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
            Submit for Review
          </Button>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Locks the schedule and sends it to the Department Chair for approval.
          </p>
        </div>
      )
    }

    if (status === 'PENDING_APPROVAL') {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Clock className="h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <span className="font-semibold">Awaiting approval</span>
            <span className="ml-1 text-amber-700">— This schedule has been submitted and is locked pending the Department Chair's review.</span>
          </div>
        </div>
      )
    }

    return null
  }

  // ── SUPER_ADMIN view ──────────────────────────────────────────────────

  if (userRole === 'SUPER_ADMIN') {
    if (status === 'DRAFT') {
      // Own (CAS) schedule: no Program Chair to wait on — generate cluster
      // majors/GEC and publish directly, same as before.
      // Own (CAS) schedule: nothing to announce. The banner that used to sit here
      // only restated what the Generate Schedule / Publish Schedule buttons in the
      // toolbar already say, so it was pure vertical noise above the schedule.
      if (isOwnSchedule) {
        return null
      }
      // Another college's schedule. The banner that used to sit here only
      // restated the Generate Schedule / Publish Schedule buttons already in
      // the toolbar, so it was vertical noise pushing the schedule down.
      return null
    }

    if (status === 'PENDING_APPROVAL') {
      const hasBlockingConflicts = unresolvedConflictCount > 0
      return (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Context banner */}
            {hasBlockingConflicts ? (
              <div className="flex-1 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span>
                  <strong>{unresolvedConflictCount}</strong> unresolved conflict{unresolvedConflictCount === 1 ? '' : 's'} must be resolved before this schedule can be approved.
                </span>
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  <strong>{departmentName ?? 'This department'}</strong> has submitted a schedule for your review.
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={isBusy || hasBlockingConflicts}
                title={hasBlockingConflicts ? 'Resolve all blocking conflicts before approving' : undefined}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {approveMutation.isPending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve
              </Button>

              <Button
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={isBusy}
                className="border-red-300 text-red-700 hover:bg-red-50 gap-2"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </div>
          </div>

          {/* Reject dialog */}
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-700">
                  <XCircle className="h-5 w-5" />
                  Return Schedule for Revision
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  The schedule will be sent back to{' '}
                  <strong>{departmentName ?? 'the Program Chair'}</strong> as a{' '}
                  <strong>DRAFT</strong> and they will be notified with your feedback.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="review-note" className="text-sm font-medium">
                    Rejection Reason <span className="text-red-500">*</span>
                  </Label>
                  <textarea
                    id="review-note"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="e.g., Faculty availability conflicts detected in Year 3 slots. Please review Wednesday 1–3 PM assignments."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This message will be sent to all Program Chairs in the department.
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setRejectOpen(false); setReviewNote('') }}
                  disabled={rejectMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending || !reviewNote.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white gap-2"
                >
                  {rejectMutation.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Return for Revision
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )
    }

    if (status === 'PUBLISHED') {
      return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              <span className="font-semibold">Published</span>
              <span className="ml-1 text-emerald-700">— This schedule is live on the master calendar.</span>
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() => resetMutation.mutate()}
            disabled={isBusy}
            className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50 gap-2"
          >
            {resetMutation.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reset to Draft
          </Button>
        </div>
      )
    }

    return null
  }

  return null
}
