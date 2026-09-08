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
import { Check, Inbox, Loader2, Send, X } from "lucide-react"

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
  const [showSettled, setShowSettled] = useState(false)

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
    mutationFn: async (body: { reason: string }) => {
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
      toast.success("Request sent to the Department Chairperson")
    },
    onError: (e: any) => toast.error(e.message),
  })

  const respond = useMutation({
    mutationFn: async (vars: { id: string; action: "approve" | "deny" }) => {
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
      toast.success(vars.action === "approve" ? "Request approved" : "Request declined")
    },
    onError: (e: any) => toast.error(e.message),
  })

  const pending = requests.filter((r) => r.status === "PENDING")
  const settled = requests.filter((r) => r.status !== "PENDING")
  const visible = showSettled ? requests : pending

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
            ? "Program Chairpersons asking for additional faculty in your department."
            : "Ask the Department Chairperson for additional faculty, and track the answer here."}
        </p>
      </CardHeader>

      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading requests…
          </p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {settled.length > 0 ? "No pending requests." : "No requests yet."}
          </p>
        ) : (
          visible.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {isSuperAdmin ? r.requesterName : "Your request"}
                  {r.subjectCode ? ` · ${r.subjectCode}` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{relativeDate(r.createdAt)}</span>
                  <Badge className={`text-[10px] ${STATUS_STYLES[r.status] ?? ""}`}>{r.status}</Badge>
                </div>
              </div>
              <p className="mt-1 text-muted-foreground">{r.reason}</p>
              {r.responseNote && (
                <p className="mt-1 italic text-muted-foreground">Response: {r.responseNote}</p>
              )}

              {isSuperAdmin && r.status === "PENDING" && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 bg-[#1B4332] text-xs text-white hover:bg-[#2D6A4F]"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: r.id, action: "approve" })}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Approve
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
          <div className="grid gap-2 py-2">
            <Label>Reason</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g. BSIT 3rd year has two sections of CPT03 but only one specialized faculty available."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => submit.mutate({ reason })}
              disabled={submit.isPending || reason.trim().length === 0}
            >
              {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
