"use client"

/**
 * Faculty requests — the tracking surface for POST /api/faculty/request.
 *
 * The endpoint already existed and already notified Department Chairs, but nothing
 * in the app rendered it: a Program Chair could send a request and then had no way
 * to see whether it had been read, and a Dept Chair had no screen to answer it on.
 * This panel is that surface for both sides.
 *
 *   Program Chairperson  — raises a request, sees their own submissions and status.
 *   Department Chairperson — sees their department's requests, approves or declines.
 *
 * Settled requests are collapsed behind a toggle so a long history doesn't bury the
 * one thing still waiting on an answer.
 */
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Check, Inbox, Loader2, Send, X, UserCheck } from "lucide-react"
import { PaginationControls, usePagination } from "@/components/shared/pagination"
import { CardListSkeleton } from "@/components/shared/loading-skeletons"
import { useSchedules, useFaculty } from "@/hooks/use-schedules"

interface FacultyRequestRow {
  id: string
  reason: string
  status: string
  responseNote: string | null
  createdAt: string
  respondedAt: string | null
  requesterName: string
  subjectCode: string | null
  subjectTitle: string | null
  /** Set once approved — the instructor the Department Chairperson allocated. */
  facultyName: string | null
  termLabel: string | null
  programAbbr: string | null
  semesterId: string | null
}

function termLabelOf(s: any): string {
  const type = s?.type === "FIRST" ? "1st" : s?.type === "SECOND" ? "2nd" : "Summer"
  return `${type} Semester ${s?.academicYear?.label ?? ""}`.trim()
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  DENIED: "bg-red-100 text-red-800",
}

function relativeDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function FacultyRequestsPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient()
  const [composeOpen, setComposeOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [semesterId, setSemesterId] = useState("")
  const [showSettled, setShowSettled] = useState(false)
  // Approval = allocation: the Department Chairperson names the instructor.
  const [approveTarget, setApproveTarget] = useState<FacultyRequestRow | null>(null)
  const [allocateFacultyId, setAllocateFacultyId] = useState("")
  const [allocateNote, setAllocateNote] = useState("")

  // Terms a Program Chairperson can request for: those with a non-archived
  // schedule in their department (the API scopes the list to their department).
  const { data: schedules = [] } = useSchedules(undefined, false, undefined, { enabled: !isSuperAdmin })
  const terms = Array.from(
    new Map((schedules as any[]).filter((sc) => sc.semester).map((sc) => [sc.semesterId, sc.semester])).entries()
  ).map(([id, sem]) => ({ id, label: termLabelOf(sem), isActive: !!sem?.isActive }))
  const defaultTermId = terms.find((t) => t.isActive)?.id ?? terms[0]?.id ?? ""

  // Instructors the Department Chairperson may allocate — their schedulable pool
  // (every CAS faculty member), the same set the generator draws GEC from.
  const { data: allocatable = [] } = useFaculty(undefined, { enabled: isSuperAdmin && !!approveTarget, scope: "schedulable" })

  const { data: requests = [], isLoading } = useQuery<FacultyRequestRow[]>({
    queryKey: ["faculty-requests"],
    queryFn: async () => {
      const res = await fetch("/api/faculty/request")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load faculty requests")
      return json.data ?? []
    },
    // Small list, and a chair wants to see a new request without reloading.
    staleTime: 0,
    refetchOnMount: "always",
  })

  const submit = useMutation({
    mutationFn: async (body: { reason: string; semesterId?: string }) => {
      const res = await fetch("/api/faculty/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to send request")
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faculty-requests"] })
      setComposeOpen(false)
      setReason("")
      setSemesterId("")
      toast.success("Request sent to the Department Chairperson")
    },
    onError: (e: any) => toast.error(e.message),
  })

  const respond = useMutation({
    mutationFn: async (vars: { id: string; action: "approve" | "deny"; facultyId?: string; responseNote?: string }) => {
      const res = await fetch("/api/faculty/request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to respond")
      return json.data
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faculty-requests"] })
      qc.invalidateQueries({ queryKey: ["notifications"] })
      qc.invalidateQueries({ queryKey: ["faculty"] })
      setApproveTarget(null)
      setAllocateFacultyId("")
      setAllocateNote("")
      toast.success(vars.action === "approve" ? "Instructor allocated" : "Request declined")
    },
    onError: (e: any) => toast.error(e.message),
  })

  const pending = requests.filter((r) => r.status === "PENDING")
  const settled = requests.filter((r) => r.status !== "PENDING")
  const visible = showSettled ? requests : pending
  const pager = usePagination(visible)

  // A Program Chair always keeps the panel — it holds the button that raises a
  // request. A Dept Chair with no requests at all has nothing to act on, so the
  // panel stays out of the way entirely.
  if (isSuperAdmin && requests.length === 0 && !isLoading) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Inbox className="h-4 w-4 text-[#1B4332]" />
            Faculty Requests
            {pending.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 text-[10px]">{pending.length} pending</Badge>
            )}
            {settled.length > 0 && (
              <button
                onClick={() => setShowSettled((v) => !v)}
                className="text-[11px] font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {showSettled ? "Hide" : "Show"} {settled.length} answered
              </button>
            )}
          </CardTitle>
          {!isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)}>
              <Send className="mr-2 h-3.5 w-3.5" /> Request faculty
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isSuperAdmin
            ? "Program Chairpersons short of qualified faculty. Approving allocates the instructor you choose to their program for the term."
            : "Short of qualified faculty for a term? Ask the Department Chairperson to allocate an instructor to your program, and track the answer here."}
        </p>
      </CardHeader>

      <CardContent className="space-y-2">
        {isLoading ? (
          <CardListSkeleton count={2} compact label="Loading requests" />
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {settled.length > 0 ? "No pending requests." : "No requests yet."}
          </p>
        ) : (
          pager.pageItems.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {isSuperAdmin ? r.requesterName : "Your request"}
                  {r.programAbbr ? ` · ${r.programAbbr}` : ""}
                  {r.subjectCode ? ` · ${r.subjectCode}` : ""}
                  {r.termLabel ? <span className="ml-1 font-normal text-muted-foreground">({r.termLabel})</span> : null}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{relativeDate(r.createdAt)}</span>
                  <Badge className={`text-[10px] ${STATUS_STYLES[r.status] ?? ""}`}>{r.status}</Badge>
                </div>
              </div>
              <p className="mt-1 text-muted-foreground">{r.reason}</p>
              {r.facultyName && (
                <p className="mt-1 flex items-center gap-1 font-medium text-[#1B4332]">
                  <UserCheck className="h-3.5 w-3.5" /> Allocated: {r.facultyName}
                </p>
              )}
              {r.responseNote && (
                <p className="mt-1 italic text-muted-foreground">Response: {r.responseNote}</p>
              )}

              {isSuperAdmin && r.status === "PENDING" && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 bg-[#1B4332] text-xs text-white hover:bg-[#2D6A4F]"
                    disabled={respond.isPending}
                    onClick={() => { setApproveTarget(r); setAllocateFacultyId(""); setAllocateNote("") }}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Allocate & approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: r.id, action: "deny" })}
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> Decline
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
        <PaginationControls
          size="sm"
          page={pager.page}
          pageCount={pager.pageCount}
          onPageChange={pager.setPage}
          total={pager.total}
          from={pager.from}
          to={pager.to}
          label="requests"
        />
      </CardContent>

      {/* Program Chair: raise a request */}
      <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) setReason("") }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request additional faculty</DialogTitle>
            <DialogDescription>
              Goes to your Department Chairperson. Say which subjects are short-staffed and why, so they
              can act on it without asking you first.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Term</Label>
              <select
                value={semesterId || defaultTermId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {terms.length === 0 && <option value="">No schedule yet — create one in Manage Schedules</option>}
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}{t.isActive ? " (active)" : ""}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">The allocated instructor joins your pool for this term only.</p>
            </div>
            <div className="grid gap-2">
              <Label>Reason</Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="e.g. BSIT 3rd year has two sections of CPT03 but only one specialized faculty available."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => submit.mutate({ reason, semesterId: semesterId || defaultTermId || undefined })}
              disabled={submit.isPending || reason.trim().length === 0 || !(semesterId || defaultTermId)}
            >
              {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Department Chairperson: allocate an instructor and approve */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => { if (!o) setApproveTarget(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Allocate an instructor</DialogTitle>
            <DialogDescription>
              {approveTarget?.requesterName}
              {approveTarget?.programAbbr ? ` (${approveTarget.programAbbr})` : ""} asked for help
              {approveTarget?.termLabel ? ` for ${approveTarget.termLabel}` : ""}
              {approveTarget?.subjectCode ? ` with ${approveTarget.subjectCode}` : ""}. The faculty member you choose joins
              that program&apos;s pool for the term — still subject to their specializations, availability and building access.
            </DialogDescription>
          </DialogHeader>
          {approveTarget && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{approveTarget.reason}</p>
          )}
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Faculty member</Label>
              <select
                value={allocateFacultyId}
                onChange={(e) => setAllocateFacultyId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select an instructor…</option>
                {(allocatable as any[])
                  .filter((f) => f.employeeId !== "TBA" && f.isActive !== false && f.user?.isActive !== false)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.user?.lastName}, {f.user?.firstName}{f.department?.abbreviation ? ` · ${f.department.abbreviation}` : ""}
                      {(f.specializations ?? []).length ? ` — ${(f.specializations ?? []).slice(0, 3).join(", ")}${(f.specializations ?? []).length > 3 ? "…" : ""}` : " — no specializations"}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Note (optional)</Label>
              <textarea
                value={allocateNote}
                onChange={(e) => setAllocateNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button
              className="bg-[#1B4332] text-white hover:bg-[#2D6A4F]"
              disabled={respond.isPending || !allocateFacultyId}
              onClick={() => approveTarget && respond.mutate({ id: approveTarget.id, action: "approve", facultyId: allocateFacultyId, responseNote: allocateNote || undefined })}
            >
              {respond.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Allocate & approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
