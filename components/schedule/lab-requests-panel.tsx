"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FlaskConical, Loader2, Send, Check, X } from "lucide-react"
import { toast } from "sonner"

interface LabRequest {
  id: string
  status: string
  reason: string
  responseNote: string | null
  createdAt: string
  requesterName: string
  targetName: string
  entry: {
    subjectCode?: string
    subjectTitle?: string
    sectionName?: string
    roomCode?: string
    day?: string
    startTime?: string
    endTime?: string
    set?: string | null
  } | null
}

interface CitLabEntry {
  id: string
  subjectCode?: string
  subjectTitle?: string
  programAbbr?: string
  chairName?: string | null
  sectionName?: string
  roomCode?: string
  day?: string
  startTime?: string
  endTime?: string
  set?: string | null
  hasPendingRequest: boolean
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    RESOLVED: "bg-green-100 text-green-800",
    DENIED: "bg-red-100 text-red-700",
    CANCELLED: "bg-gray-100 text-gray-600",
  }
  return <Badge className={`text-[10px] ${map[status] ?? ""}`}>{status}</Badge>
}

function entryLabel(e: { subjectCode?: string; sectionName?: string; day?: string; startTime?: string; endTime?: string; set?: string | null }) {
  return `${e.subjectCode ?? ""}${e.set ? ` (Set ${e.set})` : ""} · ${e.sectionName ?? ""} · ${e.day ?? ""} ${e.startTime ?? ""}-${e.endTime ?? ""}`
}

/**
 * Section 2 — the Dept Chair asks the owning CIT Program Chair to move a CIT lab that
 * blocks GEC. DC view: raise a request against a CIT lab entry. CIT chair view: act on
 * incoming requests. Renders nothing when there's nothing relevant for the role.
 */
export function LabRequestsPanel({ scheduleId, isSuperAdmin }: { scheduleId: string; isSuperAdmin: boolean }) {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState("")
  const [reason, setReason] = useState("")

  const { data } = useQuery({
    queryKey: ["lab-requests", scheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/${scheduleId}/lab-requests`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load requests")
      return json.data ?? { requests: [], citLabEntries: [] }
    },
    enabled: !!scheduleId,
  })

  const requests: LabRequest[] = data?.requests ?? []
  const citLabEntries: CitLabEntry[] = data?.citLabEntries ?? []
  const requestableEntries = citLabEntries.filter((e) => !e.hasPendingRequest)

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/schedules/${scheduleId}/lab-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: selectedEntryId, reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to send request")
      return json
    },
    onSuccess: () => {
      toast.success("Request sent to the CIT Program Chair")
      setDialogOpen(false)
      setSelectedEntryId("")
      setReason("")
      qc.invalidateQueries({ queryKey: ["lab-requests", scheduleId] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  const respondMut = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "resolve" | "deny" | "cancel" }) => {
      const res = await fetch(`/api/schedules/${scheduleId}/lab-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to update request")
      return json
    },
    onSuccess: (_d, v) => {
      toast.success(v.action === "resolve" ? "Marked resolved" : v.action === "deny" ? "Request declined" : "Request withdrawn")
      qc.invalidateQueries({ queryKey: ["lab-requests", scheduleId] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  // Hide entirely when there's nothing to show for this role.
  if (isSuperAdmin) {
    if (citLabEntries.length === 0 && requests.length === 0) return null
  } else {
    if (requests.length === 0) return null
  }

  const pending = requests.filter((r) => r.status === "PENDING")

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FlaskConical className="h-4 w-4 text-[#1B4332]" />
            CIT Lab Change Requests
            {pending.length > 0 && <Badge className="bg-amber-100 text-amber-800 text-[10px]">{pending.length} pending</Badge>}
          </CardTitle>
          {isSuperAdmin && (
            <Button
              size="sm"
              variant="outline"
              disabled={requestableEntries.length === 0}
              title={requestableEntries.length === 0 ? "No CIT labs available to request a change on" : ""}
              onClick={() => setDialogOpen(true)}
            >
              <Send className="mr-2 h-3.5 w-3.5" /> Request a lab change
            </Button>
          )}
        </div>
        <CardDescriptionText isSuperAdmin={isSuperAdmin} />
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.length === 0 ? (
          <p className="text-xs text-muted-foreground">No requests yet.</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium">
                  {r.entry ? entryLabel(r.entry) : "Lab entry"}
                  {r.entry?.roomCode ? ` · ${r.entry.roomCode}` : ""}
                </div>
                {statusBadge(r.status)}
              </div>
              <p className="mt-1 text-muted-foreground">
                {isSuperAdmin ? `To ${r.targetName}` : `From ${r.requesterName}`}: {r.reason}
              </p>
              {r.responseNote && <p className="mt-1 italic text-muted-foreground">Response: {r.responseNote}</p>}

              {r.status === "PENDING" && (
                <div className="mt-2 flex gap-2">
                  {isSuperAdmin ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => respondMut.mutate({ id: r.id, action: "cancel" })}>
                      <X className="mr-1 h-3.5 w-3.5" /> Withdraw
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" className="h-7 text-xs bg-[#1B4332] text-white hover:bg-[#2D6A4F]" onClick={() => respondMut.mutate({ id: r.id, action: "resolve" })}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Mark moved
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => respondMut.mutate({ id: r.id, action: "deny" })}>
                        <X className="mr-1 h-3.5 w-3.5" /> Decline
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>

      {/* DC: raise a new request */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request a CIT lab change</DialogTitle>
            <DialogDescription>
              You cannot edit CIT laboratory subjects — only the owning CIT Program Chairperson can. Ask them to move a
              lab that is blocking your GEC/GEL placement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Which lab?</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedEntryId}
                onChange={(e) => setSelectedEntryId(e.target.value)}
              >
                <option value="">Select a CIT lab entry…</option>
                {requestableEntries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {entryLabel(e)} {e.chairName ? `— ${e.chairName}` : "— (no chair assigned)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. This lab occupies the only slot where GEC03 can be placed for BSIT-Print 2A."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#1B4332] text-white hover:bg-[#2D6A4F]"
              disabled={!selectedEntryId || !reason.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CardDescriptionText({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <p className="text-xs text-muted-foreground">
      {isSuperAdmin
        ? "GEC cannot be placed on a CIT lab's slot (hard constraint). Ask the CIT chair to move the blocking lab."
        : "The Department Chairperson has asked you to move one of your CIT labs. Move it, then mark the request resolved."}
    </p>
  )
}
