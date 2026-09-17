"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ScrollText, CalendarDays, DoorOpen, Search, Building2, Clock, FileDown, ChevronDown, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RoleGuard } from "@/components/shared/role-guard"
import { PaginationControls, usePagination } from "@/components/shared/pagination"
import { TableSkeleton, CardListSkeleton } from "@/components/shared/loading-skeletons"
import { useSemesters } from "@/hooks/use-data"
import { useSchedules } from "@/hooks/use-schedules"
import { AUDIT_ACTION_LABELS } from "@/lib/audit-labels"
import { formatRole, LOGIN_ROLES, ROLE_LABELS } from "@/lib/roles"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditRow {
  id: string
  actorName: string
  actorRole: string
  action: string
  entityType: string
  summary: string
  scheduleId: string | null
  createdAt: string
  /** Structured details recorded by the write route (see lib/audit.ts). */
  metadata: Record<string, unknown> | null
  /** The schedule this row concerns, resolved by the API. */
  schedule: { term: string; department: string; departmentName: string; status: string } | null
}

interface AuditPage {
  items: AuditRow[]
  total: number
  page: number
  pageSize: number
}

interface Occupancy {
  id: string
  day: string
  startTime: string
  endTime: string
  set: string | null
  subjectCode: string
  subjectTitle: string
  section: string
  faculty: string
  scheduleStatus: string
  department: string
}

interface RoomOccupancy {
  id: string
  code: string
  name: string
  type: string
  isActive: boolean
  occupancy: Occupancy[]
}

interface BuildingOccupancy {
  id: string
  code: string
  name: string
  rooms: RoomOccupancy[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
}
const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  PUBLISHED: "bg-green-100 text-green-800 border-green-200",
  ARCHIVED: "bg-slate-100 text-slate-600 border-slate-200",
}
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
}

const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "schedule", label: "Schedules" },
  { value: "entry", label: "Classes" },
  { value: "user", label: "Accounts" },
  { value: "faculty", label: "Faculty" },
  { value: "availability", label: "Availability" },
  { value: "subject", label: "Subjects" },
  { value: "room", label: "Rooms" },
  { value: "building", label: "Buildings" },
]

function actionTone(action: string): string {
  if (action.endsWith(".deleted") || action.endsWith(".rejected") || action.endsWith(".deactivated")) {
    return "bg-red-100 text-red-800 border-red-200"
  }
  if (action.endsWith(".approved") || action.endsWith(".published") || action.endsWith(".created")) {
    return "bg-green-100 text-green-800 border-green-200"
  }
  if (action.endsWith(".generated") || action.endsWith(".submitted")) {
    return "bg-blue-100 text-blue-800 border-blue-200"
  }
  return "bg-gray-100 text-gray-700 border-gray-200"
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
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

function semesterLabel(s: any): string {
  const type = s?.type === "FIRST" ? "1st Semester" : s?.type === "SECOND" ? "2nd Semester" : s?.type === "SUMMER" ? "Summer" : ""
  return `${type} ${s?.academicYear?.label ?? ""}`.trim()
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemLogsPage() {
  return (
    <RoleGuard allowedRoles={["DEAN"]}>
      {/* The page title ("System Logs") comes from the topbar via PAGE_TITLES. */}
      <div className="space-y-6">
        <Tabs defaultValue="activity">
          <TabsList>
            <TabsTrigger value="activity"><ScrollText className="mr-1.5 h-4 w-4" />Activity</TabsTrigger>
            <TabsTrigger value="schedules"><CalendarDays className="mr-1.5 h-4 w-4" />Schedules</TabsTrigger>
            <TabsTrigger value="rooms"><DoorOpen className="mr-1.5 h-4 w-4" />Room Occupancy</TabsTrigger>
          </TabsList>
          <TabsContent value="activity" className="mt-4">
            <ActivityTab />
          </TabsContent>
          <TabsContent value="schedules" className="mt-4">
            <SchedulesTab />
          </TabsContent>
          <TabsContent value="rooms" className="mt-4">
            <RoomsTab />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  )
}

// ─── Activity ─────────────────────────────────────────────────────────────────

function ActivityTab() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState("all")
  const [role, setRole] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search, 300)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page) })
    if (action !== "all") p.set("action", action)
    if (role !== "all") p.set("role", role)
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (debouncedSearch) p.set("search", debouncedSearch)
    return p
  }, [page, action, role, from, to, debouncedSearch])

  const { data, isLoading } = useQuery<AuditPage>({
    queryKey: ["audit-logs", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/audit-logs?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load logs")
      return json.data
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 20
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const filtersActive = action !== "all" || role !== "all" || !!from || !!to || !!search

  function resetFilters() {
    setAction("all"); setRole("all"); setFrom(""); setTo(""); setSearch(""); setPage(1)
  }

  // Same filters, whole log (up to 5000 rows) as a spreadsheet download.
  const exportHref = `/api/audit-logs?${(() => { const p = new URLSearchParams(params); p.delete("page"); p.set("format", "csv"); return p.toString() })()}`

  const selectClass = "h-9 rounded-lg border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Department activity</CardTitle>
            <a
              href={exportHref}
              download
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary"
              title="Download the filtered log as a spreadsheet"
            >
              <FileDown className="h-4 w-4" />
              Export CSV
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search actions or people…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 sm:w-60"
              />
            </div>
            <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className={`${selectClass} sm:w-40`} aria-label="Action type">
              {ACTION_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }} className={`${selectClass} sm:w-48`} aria-label="Done by role">
              <option value="all">Anyone</option>
              {LOGIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              From
              <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className={selectClass} aria-label="From date" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              To
              <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1) }} className={selectClass} aria-label="To date" />
            </label>
            {filtersActive && (
              <button type="button" onClick={resetFilters} className="text-xs font-medium text-[#1B4332] underline underline-offset-2">
                Clear filters
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <TableSkeleton rows={8} cols={4} className="rounded-none border-0" label="Loading activity" />
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {filtersActive ? "No activity matches these filters." : "No activity recorded yet. Actions taken in your department will appear here."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="w-44">Date &amp; time</TableHead>
                    <TableHead className="w-44">Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-52">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => {
                    const meta = row.metadata && typeof row.metadata === "object" ? Object.entries(row.metadata as Record<string, unknown>) : []
                    const canExpand = meta.length > 0 || !!row.schedule
                    const isOpen = expanded === row.id
                    const d = new Date(row.createdAt)
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={canExpand ? "cursor-pointer" : ""}
                          onClick={() => canExpand && setExpanded(isOpen ? null : row.id)}
                          aria-expanded={canExpand ? isOpen : undefined}
                        >
                          <TableCell className="pr-0 text-muted-foreground">
                            {canExpand && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="block text-sm">{d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })} · {timeAgo(row.createdAt)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${actionTone(row.action)}`}>
                              {(AUDIT_ACTION_LABELS as Record<string, string>)[row.action] ?? row.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.summary}
                            {row.schedule && (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {row.schedule.term} · {row.schedule.department} · {STATUS_LABEL[row.schedule.status] ?? row.schedule.status}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="font-medium">{row.actorName}</span>
                            <span className="block text-xs text-muted-foreground">{formatRole(row.actorRole)}</span>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={4} className="py-3">
                              <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                {row.schedule && (
                                  <>
                                    <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Schedule</dt><dd>{row.schedule.term} — {row.schedule.departmentName || row.schedule.department}</dd></div>
                                    <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Schedule status now</dt><dd>{STATUS_LABEL[row.schedule.status] ?? row.schedule.status}</dd></div>
                                  </>
                                )}
                                {meta.map(([k, v]) => (
                                  <div key={k}>
                                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                                    <dd className="break-words">{v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                                  </div>
                                ))}
                                <div>
                                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Recorded at</dt>
                                  <dd>{d.toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" })}</dd>
                                </div>
                              </dl>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <PaginationControls
              page={page}
              pageCount={pageCount}
              onPageChange={setPage}
              total={total}
              from={(page - 1) * pageSize + 1}
              to={Math.min(page * pageSize, total)}
              label="actions"
              className="border-t px-4 py-3"
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Schedules ────────────────────────────────────────────────────────────────

function SchedulesTab() {
  // /api/schedules scopes a Dean to their own department server-side.
  const { data: active = [], isLoading: loadingActive } = useSchedules(undefined, false)
  const { data: archived = [], isLoading: loadingArchived } = useSchedules(undefined, true)
  const all = useMemo(() => [...(active as any[]), ...(archived as any[])], [active, archived])
  const pager = usePagination(all)
  const isLoading = loadingActive || loadingArchived

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Schedules in your department</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <TableSkeleton rows={6} cols={5} className="rounded-none border-0" label="Loading schedules" />
        ) : all.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No schedules have been created for your department yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Term</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Classes</TableHead>
                    <TableHead className="text-right">Conflicts</TableHead>
                    <TableHead>Last generated</TableHead>
                    <TableHead>Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pager.pageItems.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{semesterLabel(s.semester)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[s.status] ?? ""}`}>
                          {STATUS_LABEL[s.status] ?? s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{s._count?.entries ?? 0}</TableCell>
                      <TableCell className="text-right">{s._count?.conflicts ?? 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.generatedAt ? formatWhen(s.generatedAt) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.publishedAt ? formatWhen(s.publishedAt) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PaginationControls
              page={pager.page}
              pageCount={pager.pageCount}
              onPageChange={pager.setPage}
              total={pager.total}
              from={pager.from}
              to={pager.to}
              label="schedules"
              className="border-t px-4 py-3"
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Room occupancy ───────────────────────────────────────────────────────────

function RoomsTab() {
  const { data: semesters = [] } = useSemesters()
  const activeSemester = useMemo(() => (semesters as any[]).find((s) => s.isActive) ?? (semesters as any[])[0], [semesters])
  const [semesterId, setSemesterId] = useState<string>("")
  const [day, setDay] = useState<string>("all")
  const effectiveSemesterId = semesterId || activeSemester?.id || ""

  const { data, isLoading } = useQuery<{ semester: any; buildings: BuildingOccupancy[] }>({
    queryKey: ["dean-room-occupancy", effectiveSemesterId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (effectiveSemesterId) params.set("semesterId", effectiveSemesterId)
      const res = await fetch(`/api/dean/room-occupancy?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load room occupancy")
      return json.data
    },
    staleTime: 30_000,
  })

  const buildings = data?.buildings ?? []
  const totalClasses = buildings.reduce((n, b) => n + b.rooms.reduce((m, r) => m + r.occupancy.length, 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${buildings.length} building${buildings.length === 1 ? "" : "s"} · ${totalClasses} class${totalClasses === 1 ? "" : "es"} this term`}
        </p>
        <div className="flex gap-2">
          <select
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All days</option>
            {DAY_ORDER.map((d) => (
              <option key={d} value={d}>{DAY_LABEL[d]}</option>
            ))}
          </select>
          <select
            value={effectiveSemesterId}
            onChange={(e) => setSemesterId(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {(semesters as any[]).map((s) => (
              <option key={s.id} value={s.id}>{semesterLabel(s)}{s.isActive ? " (active)" : ""}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <CardListSkeleton count={3} label="Loading room occupancy" />
      ) : buildings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No buildings are assigned to your department yet. Assign buildings under Buildings to see who uses their rooms.
          </CardContent>
        </Card>
      ) : (
        buildings.map((b) => (
          <Card key={b.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-[#1B4332]" />
                {b.name}
                <span className="text-xs font-normal text-muted-foreground">{b.code} · {b.rooms.length} room{b.rooms.length === 1 ? "" : "s"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {b.rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rooms in this building.</p>
              ) : (
                b.rooms.map((room) => {
                  const rows = room.occupancy
                    .filter((o) => day === "all" || o.day === day)
                    .sort((a, c) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(c.day) || a.startTime.localeCompare(c.startTime))
                  return (
                    <div key={room.id} className="rounded-lg border">
                      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <DoorOpen className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{room.code}</span>
                          <span className="text-xs text-muted-foreground">{room.name}</span>
                          <Badge variant="outline" className="text-[10px]">{room.type.replace(/_/g, " ")}</Badge>
                          {!room.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {rows.length} class{rows.length === 1 ? "" : "es"}
                        </span>
                      </div>
                      {rows.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">Free{day !== "all" ? ` on ${DAY_LABEL[day]}` : " all week"}.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-28">Day · Time</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead>Section</TableHead>
                                <TableHead>Faculty</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((o) => (
                                <TableRow key={o.id}>
                                  <TableCell className="whitespace-nowrap text-xs">
                                    <span className="font-medium">{DAY_LABEL[o.day] ?? o.day}</span>
                                    <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{o.startTime}–{o.endTime}</span>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    <span className="font-medium">{o.subjectCode}</span>
                                    {o.set && <Badge variant="outline" className="ml-1 text-[10px]">Set {o.set}</Badge>}
                                    <span className="block text-xs text-muted-foreground">{o.subjectTitle}</span>
                                  </TableCell>
                                  <TableCell className="text-sm">{o.section}</TableCell>
                                  <TableCell className="text-sm">{o.faculty}</TableCell>
                                  <TableCell className="text-sm">{o.department}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[o.scheduleStatus] ?? ""}`}>
                                      {STATUS_LABEL[o.scheduleStatus] ?? o.scheduleStatus}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
