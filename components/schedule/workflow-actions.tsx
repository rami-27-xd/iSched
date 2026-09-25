'use client'

/**
 * WorkflowActions — the approval strip above a schedule, by role and status
 * (see CLAUDE.md "Scheduling Workflow"; spec 2026-09-26):
 *
 * ┌──────────────────────────────┬────────────────────────────────────────────────────┐
 * │ Role / Status                │ Shows                                              │
 * ├──────────────────────────────┼────────────────────────────────────────────────────┤
 * │ ADMIN + DRAFT (own dept)     │ Who is done plotting · [Mark my subjects as done]  │
 * │                              │ · [Submit for Approval] — unlocks once GEC/GEL is  │
 * │                              │ finalized and EVERY Program Chairperson is done    │
 * │ ADMIN + PENDING_APPROVAL     │ "Waiting for the Dean's approval" (locked)         │
 * │ DEAN + DRAFT                 │ Who is done plotting (read-only)                   │
 * │ DEAN + PENDING_APPROVAL      │ [Approve ✓]  [Return for revision ✗]               │
 * │ DEAN + PUBLISHED             │ Published banner                                   │
 * │ SUPER_ADMIN + PENDING        │ "Waiting for the Dean" (read-only)                 │
 * │ SUPER_ADMIN + PUBLISHED      │ Published banner · [Reset to Draft]                │
 * └──────────────────────────────┴────────────────────────────────────────────────────┘
 *
 * The Department Chairperson's own CAS schedule has no Program Chairpersons; they
 * publish it directly with Publish Schedule in the toolbar.
 */

import * as React from 'react'
import {
  CheckCircle2, Circle, SendHorizontal, XCircle, Clock, ShieldCheck, AlertTriangle, RotateCcw, Users, Loader2,
} from 'lucide-react'
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ── Types ─────────────────────────────────────────────────────────────────

export interface WorkflowActionsProps {
  scheduleId: string
  status: string          // current ScheduleStatus
  userRole: string        // 'DEAN' | 'SUPER_ADMIN' | 'ADMIN' | …
  departmentName?: string
  /**
   * The schedule belongs to the signed-in user's own department (a Program
   * Chairperson's or Dean's department; for a Department Chairperson, their own
   * CAS schedule). Program Chairpersons and Deans act only on their own.
   */
  isOwnSchedule?: boolean
  /** All three CAS department heads have finalized GEC/GEL for this schedule. */
  gecReady?: boolean
  /** The signed-in Program Chairperson's program — their row in the list. */
  myProgramId?: string | null
  /**
   * Count of unresolved, blocking ConflictLog rows (LOAD_EXCEEDED warnings
   * excluded). While > 0 the Dean's Approve button is disabled; the server runs
   * the full term-wide check again on approve.
   */
  unresolvedConflictCount?: number
  onStatusChange?: (newStatus: string) => void
}

interface ProgramRow {
  programId: string
  abbreviation: string
  name: string
  chairs: { id: string; name: string }[]
  finalized: boolean
  finalizedBy: string | null
  finalizedAt: string | null
}
interface ProgramStatus {
  programs: ProgramRow[]
  done: number
  total: number
  allFinalized: boolean
}

// ── API helpers ───────────────────────────────────────────────────────────

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

// Keyed under ["schedules", id] on purpose: every entry mutation already
// invalidates that prefix, so a Program Chairperson's edit (which reopens their
// "done" mark on the server) refreshes this list too.
export function programFinalizationKey(scheduleId: string) {
  return ['schedules', scheduleId, 'program-finalization'] as const
}

function formatShortDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Program list ──────────────────────────────────────────────────────────

function ProgramProgressList({ programs, myProgramId }: { programs: ProgramRow[]; myProgramId?: string | null }) {
  return (
    <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
      {programs.map((p) => {
        const chair = p.chairs[0]?.name
        const mine = p.programId === myProgramId
        return (
          <li
            key={p.programId}
            className="flex min-w-0 items-center gap-1.5 text-xs"
            title={`${p.name}${chair ? ` — ${chair}` : ''}${p.finalized ? ` · marked done${p.finalizedBy ? ` by ${p.finalizedBy}` : ''}${p.finalizedAt ? `, ${formatShortDate(p.finalizedAt)}` : ''}` : ' · still plotting'}`}
          >
            {p.finalized ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}
            {/* Fixed-width code column so "done / still plotting" lines up row to row. */}
            <span className="flex w-28 shrink-0 items-center gap-1">
              <span className={`truncate font-semibold ${mine ? 'text-[#1B4332]' : ''}`}>{p.abbreviation}</span>
              {mine && <span className="shrink-0 rounded bg-[#1B4332]/10 px-1 text-[10px] font-medium text-[#1B4332]">you</span>}
            </span>
            <span className={`min-w-0 truncate ${p.finalized ? 'text-green-700' : 'text-muted-foreground'}`}>
              {p.finalized ? 'done' : 'still plotting'}
              {chair ? ` · ${chair}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

export function WorkflowActions({
  scheduleId,
  status,
  userRole,
  departmentName,
  isOwnSchedule = true,
  gecReady,
  myProgramId,
  unresolvedConflictCount = 0,
  onStatusChange,
}: WorkflowActionsProps) {
  const queryClient = useQueryClient()
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [reviewNote, setReviewNote] = React.useState('')

  const isAdmin = userRole === 'ADMIN'
  const isDean = userRole === 'DEAN'
  const showsProgress = (isAdmin || isDean) && isOwnSchedule && status === 'DRAFT'

  const { data: progress, isLoading: progressLoading } = useQuery<ProgramStatus>({
    queryKey: programFinalizationKey(scheduleId),
    queryFn: async () => {
      const res = await fetch(`/api/schedules/${scheduleId}/program-finalize`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load who is done')
      return json.data
    },
    enabled: showsProgress,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  // Shared mutation invalidator
  function invalidate(newStatus: string) {
    queryClient.invalidateQueries({ queryKey: ['schedules'] })
    queryClient.invalidateQueries({ queryKey: ['schedule', scheduleId] })
    onStatusChange?.(newStatus)
  }

  // ── Mark my subjects done / reopen (ADMIN, DRAFT) ──────────────────────
  const finalizeMutation = useMutation({
    mutationFn: async (action: 'finalize' | 'unfinalize') => {
      const res = await fetch(`/api/schedules/${scheduleId}/program-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.details?.[0] ?? json.error ?? 'Request failed')
      return json.data as ProgramStatus
    },
    onSuccess: (data, action) => {
      queryClient.setQueryData(programFinalizationKey(scheduleId), data)
      if (action === 'unfinalize') {
        toast.info('Reopened — your subjects are editable again.')
      } else if (data.allFinalized) {
        toast.success('Marked as done — everyone is done now.', {
          description: 'Submit the schedule for the Dean\'s approval.',
        })
      } else {
        const left = data.total - data.done
        toast.success('Your subjects are marked as done.', {
          description: `Waiting for ${left} more Program Chairperson${left === 1 ? '' : 's'} before the schedule can be submitted.`,
        })
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Submit (ADMIN: DRAFT → PENDING_APPROVAL) ───────────────────────────
  const submitMutation = useMutation({
    mutationFn: () => callWorkflow(scheduleId, 'submit'),
    onSuccess: () => {
      toast.success('Submitted for approval', {
        description: 'The Dean has been notified. The schedule is locked until the Dean decides.',
        duration: 5000,
      })
      invalidate('PENDING_APPROVAL')
    },
    onError: (err: Error) => {
      toast.error('Could not submit', { description: err.message })
      queryClient.invalidateQueries({ queryKey: programFinalizationKey(scheduleId) })
    },
  })

  // ── Approve (DEAN: PENDING_APPROVAL → PUBLISHED) ───────────────────────
  const approveMutation = useMutation({
    mutationFn: () => callWorkflow(scheduleId, 'approve'),
    onSuccess: () => {
      toast.success('Schedule approved and published', {
        description: 'The Program Chairpersons have been notified.',
        duration: 5000,
      })
      invalidate('PUBLISHED')
    },
    onError: (err: Error) => {
      toast.error('Could not approve', { description: err.message, duration: 8000 })
      // A failed approve records the conflicts it found — show them.
      queryClient.invalidateQueries({ queryKey: ['schedules', scheduleId] })
    },
  })

  // ── Return for revision (DEAN: PENDING_APPROVAL → DRAFT) ───────────────
  const rejectMutation = useMutation({
    mutationFn: () => callWorkflow(scheduleId, 'reject', reviewNote),
    onSuccess: () => {
      toast.info('Schedule returned for revision', {
        description: 'The Program Chairpersons have been notified with your note.',
        duration: 5000,
      })
      setRejectOpen(false)
      setReviewNote('')
      invalidate('DRAFT')
    },
    onError: (err: Error) => {
      toast.error('Could not return the schedule', { description: err.message })
    },
  })

  // ── Reset (SUPER_ADMIN: PUBLISHED → DRAFT) ────────────────────────────
  const resetMutation = useMutation({
    mutationFn: () => callWorkflow(scheduleId, 'reset'),
    onSuccess: () => {
      toast.info('Schedule reset to Draft', {
        description: 'The Program Chairpersons can update it and submit it again.',
        duration: 5000,
      })
      invalidate('DRAFT')
    },
    onError: (err: Error) => {
      toast.error('Reset failed', { description: err.message })
    },
  })

  const isBusy =
    submitMutation.isPending || approveMutation.isPending || rejectMutation.isPending ||
    resetMutation.isPending || finalizeMutation.isPending

  // ── ADMIN (Program Chairperson) ───────────────────────────────────────

  if (isAdmin) {
    if (!isOwnSchedule) return null

    if (status === 'DRAFT') {
      const programs = progress?.programs ?? []
      const mine = programs.find((p) => p.programId === myProgramId) ?? null
      const everyoneDone = !!progress?.allFinalized
      const waitingOn = programs.filter((p) => !p.finalized)
      const canSubmit = !!gecReady && everyoneDone

      const hint = !gecReady
        ? 'Marking your subjects as done and submitting unlock once all three CAS department heads have finalized GEC/GEL.'
        : !mine
          ? 'Your account is not linked to one of these programs — ask your Dean to assign your program.'
          : !mine.finalized
            ? 'When your program’s classes are complete, mark them as done. Adding, editing or removing a class later reopens it automatically.'
            : everyoneDone
              ? 'Everyone is done — submit the schedule for the Dean’s approval. It stays locked while the Dean reviews it.'
              : `Submit unlocks when everyone is done — still plotting: ${waitingOn.map((p) => p.abbreviation).join(', ')}.`

      return (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 font-medium">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                Program Chairpersons — done plotting
                {progress && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${everyoneDone ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {progress.done} of {progress.total} done
                  </span>
                )}
              </p>
              {progressLoading ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking who is done…
                </p>
              ) : (
                <ProgramProgressList programs={programs} myProgramId={myProgramId} />
              )}
              <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {mine && (
                <Button
                  variant={mine.finalized ? 'outline' : 'default'}
                  onClick={() => finalizeMutation.mutate(mine.finalized ? 'unfinalize' : 'finalize')}
                  disabled={isBusy || (!mine.finalized && !gecReady)}
                  title={!mine.finalized && !gecReady ? 'Unlocks once GEC/GEL is finalized' : undefined}
                  className={mine.finalized ? 'gap-2' : 'gap-2 bg-[#1B4332] text-white hover:bg-[#2D6A4F]'}
                >
                  {finalizeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mine.finalized ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {mine.finalized ? `Reopen ${mine.abbreviation}` : 'Mark my subjects as done'}
                </Button>
              )}
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={isBusy || !canSubmit}
                title={canSubmit ? 'Send the schedule to the Dean for approval' : 'Unlocks when every Program Chairperson in the department is done'}
                className="gap-2 bg-[#D4AF37] text-[#1B4332] hover:bg-[#C9A42F] disabled:bg-muted disabled:text-muted-foreground"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizontal className="h-4 w-4" />
                )}
                Submit for Approval
              </Button>
            </div>
          </div>
        </div>
      )
    }

    if (status === 'PENDING_APPROVAL') {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-semibold">Waiting for the Dean&apos;s approval</span>
            <span className="ml-1 text-amber-700">— the schedule is locked until the Dean approves it or returns it with a note.</span>
          </p>
        </div>
      )
    }

    return null
  }

  // ── DEAN ──────────────────────────────────────────────────────────────

  if (isDean) {
    if (!isOwnSchedule) return null

    if (status === 'DRAFT') {
      const programs = progress?.programs ?? []
      if (!progressLoading && programs.length === 0) return null
      return (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 font-medium">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            Program Chairpersons — done plotting
            {progress && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${progress.allFinalized ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {progress.done} of {progress.total} done
              </span>
            )}
          </p>
          {progressLoading ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking who is done…
            </p>
          ) : (
            <ProgramProgressList programs={programs} />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Once every Program Chairperson is done, they submit the schedule and it comes to you for approval.
          </p>
        </div>
      )
    }

    if (status === 'PENDING_APPROVAL') {
      const hasBlockingConflicts = unresolvedConflictCount > 0
      return (
        <>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            {hasBlockingConflicts ? (
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span>
                  <strong>{unresolvedConflictCount}</strong> unresolved conflict{unresolvedConflictCount === 1 ? '' : 's'} — return the schedule so the Program Chairpersons can fix {unresolvedConflictCount === 1 ? 'it' : 'them'}.
                </span>
              </div>
            ) : (
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  <strong>{departmentName ?? 'Your department'}</strong> submitted this schedule for your approval — every Program Chairperson has marked their subjects as done.
                </span>
              </div>
            )}

            <div className="flex shrink-0 items-center gap-2">
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={isBusy || hasBlockingConflicts}
                title={hasBlockingConflicts ? 'Conflicts must be fixed first — return the schedule for revision' : 'Approve and publish this schedule'}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve
              </Button>

              <Button
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={isBusy}
                className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" />
                Return for Revision
              </Button>
            </div>
          </div>

          {/* Return-for-revision dialog */}
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
                  The schedule goes back to the Program Chairpersons of{' '}
                  <strong>{departmentName ?? 'the department'}</strong> as a <strong>Draft</strong>, with your note.
                  They fix it and submit it again.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="review-note" className="text-sm font-medium">
                    Reason <span className="text-red-500">*</span>
                  </Label>
                  <textarea
                    id="review-note"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="e.g., BSIT 2-A has two classes in the same room on Wednesday 1–3 PM."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Every Program Chairperson of the department receives this note.
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
                  className="gap-2 bg-red-600 text-white hover:bg-red-700"
                >
                  {rejectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
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
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            <span className="font-semibold">Approved and published</span>
            <span className="ml-1 text-emerald-700">— this schedule is live.</span>
          </span>
        </div>
      )
    }

    return null
  }

  // ── SUPER_ADMIN (Department Chairperson) ──────────────────────────────

  if (userRole === 'SUPER_ADMIN') {
    // DRAFT: nothing to announce — Generate / Publish (own CAS schedule) are in
    // the toolbar, and the GEC/GEL finalization card sits right below.
    if (status === 'PENDING_APPROVAL') {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>
            <span className="font-semibold">Submitted — waiting for the Dean</span>
            <span className="ml-1 text-blue-700">
              — the Program Chairpersons of {departmentName ?? 'this department'} submitted it; their Dean approves or returns it.
            </span>
          </p>
        </div>
      )
    }

    if (status === 'PUBLISHED') {
      return (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
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
            className="shrink-0 gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {resetMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
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
