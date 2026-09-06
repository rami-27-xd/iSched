'use client'

/**
 * ClusterApprovalBoard — shows the SUPER_ADMIN only the schedules that belong
 * to departments inside their assigned Faculty Cluster. Unscoped SUPER_ADMINs
 * (clusterId = null) see all pending schedules.
 *
 * For each pending schedule it renders Approve and Reject buttons wired to the
 * workflow API.
 */

import * as React from 'react'
import {
  CheckCircle2, XCircle, Clock, Building2, CalendarDays,
  Loader2, AlertTriangle, ShieldCheck, Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchPendingSchedules(clusterId?: string | null) {
  const params = new URLSearchParams({ status: 'PENDING_APPROVAL' })
  if (clusterId) params.set('clusterId', clusterId)
  const res = await fetch(`/api/schedules?${params}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed to fetch schedules')
  return json.data ?? []
}

async function callWorkflow(
  scheduleId: string,
  action: 'approve' | 'reject',
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

// ── ScheduleCard ──────────────────────────────────────────────────────────

function ScheduleCard({
  schedule,
  onApprove,
  onReject,
  busy,
}: {
  schedule: any
  onApprove: () => void
  onReject: () => void
  busy: boolean
}) {
  const semLabel =
    schedule.semester?.type === 'FIRST'
      ? '1st Semester'
      : schedule.semester?.type === 'SECOND'
      ? '2nd Semester'
      : 'Summer'

  const ayLabel = schedule.semester?.academicYear?.label ?? ''
  const deptName = schedule.department?.name ?? 'Unknown Department'
  const clusterName = schedule.department?.cluster?.name

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <CalendarDays className="h-4 w-4 text-[#1B4332]" />
              <span className="text-sm font-semibold">{semLabel} {ayLabel}</span>
              <Badge className="bg-amber-100 text-amber-800 text-[10px]">Pending Review</Badge>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3.5 w-3.5" />
              <span>{deptName}</span>
              {clusterName && (
                <span className="rounded-full bg-[#1B4332]/10 text-[#1B4332] px-2 py-0.5 text-[10px] font-medium">
                  {clusterName}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {schedule._count?.entries ?? 0} entries · Submitted for approval
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={onApprove}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={busy}
              className="border-red-300 text-red-700 hover:bg-red-50 gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ClusterApprovalBoard({
  clusterId,
  clusterName,
}: {
  clusterId?: string | null
  clusterName?: string | null
}) {
  const queryClient = useQueryClient()
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null)
  const [reviewNote, setReviewNote] = React.useState('')
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['pending-schedules', clusterId],
    queryFn: () => fetchPendingSchedules(clusterId),
    staleTime: 15_000,
    refetchInterval: 30_000, // poll every 30s for new submissions
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['pending-schedules'] })
    queryClient.invalidateQueries({ queryKey: ['schedules'] })
  }

  const approveMutation = useMutation({
    mutationFn: (scheduleId: string) => callWorkflow(scheduleId, 'approve'),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      toast.success('Schedule approved and published to master calendar')
      setBusyId(null)
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setBusyId(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ scheduleId, note }: { scheduleId: string; note: string }) =>
      callWorkflow(scheduleId, 'reject', note),
    onMutate: ({ scheduleId }) => setBusyId(scheduleId),
    onSuccess: () => {
      toast.info('Schedule returned to Program Chair for revision')
      setRejectTarget(null)
      setReviewNote('')
      setBusyId(null)
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setBusyId(null)
    },
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            Pending Approvals
            {schedules.length > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-bold">
                {schedules.length}
              </span>
            )}
          </h3>
          {clusterName ? (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Filter className="h-3 w-3" />
              Filtered to: <strong className="text-[#1B4332] ml-1">{clusterName}</strong>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Showing all departments</p>
          )}
        </div>
      </div>

      {/* Schedule list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Loading pending schedules…
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
          <ShieldCheck className="h-9 w-9 text-emerald-400 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">All clear — no pending approvals</p>
          <p className="text-xs text-muted-foreground mt-1">
            Schedules submitted by Program Chairs will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s: any) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              busy={busyId === s.id}
              onApprove={() => approveMutation.mutate(s.id)}
              onReject={() => setRejectTarget(s.id)}
            />
          ))}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => { if (!v) { setRejectTarget(null); setReviewNote('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />Return for Revision
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <span>The schedule will be sent back as <strong>DRAFT</strong> and the Program Chair will be notified with your feedback.</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rnote" className="text-sm font-medium">
                Rejection Reason <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="rnote"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="e.g. Faculty conflicts detected on Wednesday afternoon. Please review sections 3-A and 3-B overlapping in Room CIT-LH101."
                rows={4}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground">This note will be sent to all Program Chairs in the department.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRejectTarget(null); setReviewNote('') }}
              disabled={rejectMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => rejectTarget && rejectMutation.mutate({ scheduleId: rejectTarget, note: reviewNote })}
              disabled={rejectMutation.isPending || !reviewNote.trim()}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Return for Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
