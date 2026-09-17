"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  UserCheck,
  CalendarDays,
  Users,
  AlertTriangle,
  ScrollText,
  CheckCircle2,
  ArrowRight,
  Inbox,
} from "lucide-react"
import { KPICard } from "@/components/shared/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CardListSkeleton, LinesSkeleton } from "@/components/shared/loading-skeletons"
import { AUDIT_ACTION_LABELS } from "@/lib/audit-labels"
import { formatRole } from "@/lib/roles"

/**
 * The Dean's dashboard. A Dean does not schedule anything, so the generic
 * scheduling KPIs + navigation shortcuts were noise for them. What a Dean
 * actually acts on, in the order they need it:
 *
 *   1. Accounts waiting for their approval — approvable right here.
 *   2. The state of their department's schedules this term.
 *   3. What has been happening in the department (the audit trail).
 *
 * Everything links into the fuller page (User Management, Manage Schedules,
 * System Logs) for the detail.
 */

interface PendingUser {
  id: string
  firstName: string
  lastName: string
  email: string | null
  role: string
  createdAt: string
  programHead?: { program?: { abbreviation?: string | null; name?: string } | null } | null
}

interface AuditRow {
  id: string
  actorName: string
  actorRole: string
  action: string
  summary: string
  createdAt: string
}

interface DeanDashboardProps {
  stats: { activeSchedules: number; totalFaculty: number; conflictsDetected?: number; unassignedSubjects: number }
  statsLoading: boolean
  recentSchedules: any[]
  renderStatus: (status: string) => React.ReactNode
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
}

function semesterLabel(s: any): string {
  const type = s?.type === "FIRST" ? "1st" : s?.type === "SECOND" ? "2nd" : s?.type === "SUMMER" ? "Summer" : ""
  return `${type} Semester ${s?.academicYear?.label ?? ""}`.trim()
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  return d === 1 ? "yesterday" : `${d} days ago`
}

function actionTone(action: string): string {
  if (action.endsWith(".deleted") || action.endsWith(".rejected") || action.endsWith(".deactivated")) return "bg-red-100 text-red-800 border-red-200"
  if (action.endsWith(".approved") || action.endsWith(".published") || action.endsWith(".created")) return "bg-green-100 text-green-800 border-green-200"
  if (action.endsWith(".generated") || action.endsWith(".submitted")) return "bg-blue-100 text-blue-800 border-blue-200"
  return "bg-gray-100 text-gray-700 border-gray-200"
}

export function DeanDashboard({ stats, statsLoading, recentSchedules, renderStatus }: DeanDashboardProps) {
  const queryClient = useQueryClient()

  // Accounts of the Dean's department still waiting for approval (server-scoped).
  const { data: pending = [], isLoading: loadingPending } = useQuery<PendingUser[]>({
    queryKey: ["users", "pending-for-dean"],
    queryFn: async () => {
      const res = await fetch("/api/users?approved=false")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load pending accounts")
      return json.data ?? []
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  })

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isApproved: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Approval failed")
      return json.data
    },
    onSuccess: (_d, id) => {
      const u = pending.find((p) => p.id === id)
      toast.success(u ? `${u.firstName} ${u.lastName} approved` : "Account approved")
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
      queryClient.invalidateQueries({ queryKey: ["dean-recent-activity"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // The last few things done in the department — the same feed as System Logs.
  const { data: activity, isLoading: loadingActivity } = useQuery<{ items: AuditRow[]; total: number }>({
    queryKey: ["dean-recent-activity"],
    queryFn: async () => {
      const res = await fetch("/api/audit-logs?page=1")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load activity")
      return json.data
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
  const recentActivity = (activity?.items ?? []).slice(0, 6)

  const statusCounts = recentSchedules.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* KPI row — what needs the Dean's attention */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Awaiting Approval"
          value={loadingPending ? "—" : String(pending.length)}
          icon={UserCheck}
          variant={pending.length > 0 ? "error" : "success"}
        />
        <KPICard
          title="Department Schedules"
          value={statsLoading ? "—" : String(stats.activeSchedules)}
          icon={CalendarDays}
          variant="default"
        />
        <KPICard
          title="Faculty"
          value={statsLoading ? "—" : String(stats.totalFaculty)}
          icon={Users}
          variant="accent"
        />
        <KPICard
          title="Unresolved Conflicts"
          value={statsLoading ? "—" : String(stats.conflictsDetected ?? 0)}
          icon={AlertTriangle}
          variant={(stats.conflictsDetected ?? 0) > 0 ? "error" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. Accounts awaiting approval — the Dean's primary job */}
        <Card className={pending.length > 0 ? "border-amber-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              Accounts awaiting approval
            </CardTitle>
            <Link href="/dashboard/users" className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332] hover:underline">
              User Management <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {loadingPending ? (
              <CardListSkeleton count={3} compact label="Loading pending accounts" />
            ) : pending.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                No accounts are waiting. New registrations in your department will appear here.
              </div>
            ) : (
              <div className="space-y-2">
                {pending.slice(0, 5).map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.firstName} {u.lastName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatRole(u.role)}
                        {u.programHead?.program ? ` · ${u.programHead.program.abbreviation ?? u.programHead.program.name}` : ""}
                        {" · "}registered {timeAgo(u.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 bg-[#1B4332] text-white hover:bg-[#2D6A4F]"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(u.id)}
                    >
                      Approve
                    </Button>
                  </div>
                ))}
                {pending.length > 5 && (
                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    +{pending.length - 5} more in User Management
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Department schedules — status at a glance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Department schedules
            </CardTitle>
            <Link href="/dashboard/logs" className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332] hover:underline">
              System Logs <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <CardListSkeleton count={3} compact label="Loading schedules" />
            ) : recentSchedules.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No schedules have been created for your department yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(statusCounts).map(([status, n]) => (
                    <Badge key={status} variant="outline" className="text-[10px]">
                      {n} {STATUS_LABEL[status] ?? status}
                    </Badge>
                  ))}
                </div>
                {recentSchedules.map((s: any) => (
                  <Link
                    key={s.id}
                    href="/dashboard/schedules"
                    className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{semesterLabel(s.semester)}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{s._count?.entries ?? 0} classes</span>
                        {s._count?.unassigned > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            <Inbox className="h-3 w-3" />
                            {s._count.unassigned} unassigned
                          </span>
                        )}
                        {s._count?.conflicts > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3" />
                            {s._count.conflicts} conflicts
                          </span>
                        )}
                      </div>
                    </div>
                    {renderStatus(s.status)}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Recent activity — the audit trail, newest first */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ScrollText className="h-4 w-4 text-muted-foreground" />
              Recent activity in your department
            </CardTitle>
            <Link href="/dashboard/logs" className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332] hover:underline">
              All activity <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <LinesSkeleton lines={4} label="Loading activity" />
            ) : recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing recorded yet. Actions taken in your department will show up here.
              </p>
            ) : (
              <ul className="divide-y">
                {recentActivity.map((row) => (
                  <li key={row.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <Badge variant="outline" className={`w-fit shrink-0 text-[10px] ${actionTone(row.action)}`}>
                      {(AUDIT_ACTION_LABELS as Record<string, string>)[row.action] ?? row.action}
                    </Badge>
                    <p className="min-w-0 flex-1 truncate text-sm" title={row.summary}>{row.summary}</p>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {row.actorName} · {formatRole(row.actorRole)} · {timeAgo(row.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
