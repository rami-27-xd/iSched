"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ScrollText, CalendarDays, DoorOpen, Search, FileDown, ChevronDown, ChevronRight, Info, Layers, ListChecks, Clock, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RoleGuard } from "@/components/shared/role-guard"
import { PaginationControls, usePagination } from "@/components/shared/pagination"
import { TableSkeleton } from "@/components/shared/loading-skeletons"
import { RoomOccupancyView } from "@/components/rooms/room-occupancy-view"
import { SubjectSummaryView } from "@/components/schedule/subject-summary-view"
import { DepartmentChip, DepartmentLegend } from "@/components/shared/department-legend"
import { useSemesters } from "@/hooks/use-data"
import { useUserRole } from "@/components/layout/dashboard-shell"
import { useDepartments } from "@/hooks/use-data"
import { useSchedules } from "@/hooks/use-schedules"
import { AUDIT_ACTION_LABELS } from "@/lib/audit-labels"
import { formatRole, LOGIN_ROLES, ROLE_LABELS } from "@/lib/roles"
import { ROLE_BADGE_STYLE, ROLE_DOT_STYLE, ACTION_TONES, actionTone } from "@/lib/log-legend"

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * System Logs — everything about the term in one place: the audit trail
 * (Activity), the schedules, every scheduled class (section · course · subject
 * · faculty · room · time), the Subject Summary and Room Occupancy. Every tab
 * colours departments/colleges the same way (lib/department-colors.ts).
 * Who sees what (mirrors the APIs):
 *   Dean / Program Chairperson — their own department
 *   Department Chairperson     — every department, with a department filter
 */
export default function SystemLogsPage() {
  return (
    <RoleGuard allowedRoles={["DEAN", "SUPER_ADMIN", "ADMIN"]}>
      {/* The page title ("System Logs") comes from the topbar via PAGE_TITLES. */}
      <div className="space-y-6">
        <Tabs defaultValue="activity">
          <TabsList className="flex-wrap">
            <TabsTrigger value="activity"><ScrollText className="mr-1.5 h-4 w-4" />Activity</TabsTrigger>
            <TabsTrigger value="schedules"><CalendarDays className="mr-1.5 h-4 w-4" />Schedules</TabsTrigger>
            <TabsTrigger value="classes"><ListChecks className="mr-1.5 h-4 w-4" />Classes</TabsTrigger>
            <TabsTrigger value="subjects"><Layers className="mr-1.5 h-4 w-4" />Subject Summary</TabsTrigger>
            <TabsTrigger value="rooms"><DoorOpen className="mr-1.5 h-4 w-4" />Room Occupancy</TabsTrigger>
          </TabsList>
          <TabsContent value="activity" className="mt-4">
            <ActivityTab />
          </TabsContent>
          <TabsContent value="schedules" className="mt-4">
            <SchedulesTab />
          </TabsContent>
          <TabsContent value="classes" className="mt-4">
            <ClassesTab />
          </TabsContent>
          <TabsContent value="subjects" className="mt-4">
            <SubjectSummaryView />
          </TabsContent>
          <TabsContent value="rooms" className="mt-4">
            <RoomOccupancyView />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

/**
 * Colour key for the Activity table: one colour per ROLE (who did it — the
 * badge under each name) and one per KIND of action (what happened — the
 * action badge). Collapsible so it never crowds the table once learned.
 */
function LogLegend() {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-muted-foreground"
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5" />
        Colour key
        {open ? <ChevronDown className="ml-auto h-3.5 w-3.5" /> : <ChevronRight className="ml-auto h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="grid gap-3 border-t px-3 py-2.5 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 font-semibold text-foreground/80">Who — role of the person</p>
            <div className="flex flex-wrap gap-1.5">
              {LOGIN_ROLES.map((r) => (
                <span key={r} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${ROLE_BADGE_STYLE[r]}`}>
                  <span className={`h-2 w-2 rounded-full ${ROLE_DOT_STYLE[r]}`} />
                  {ROLE_LABELS[r]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 font-semibold text-foreground/80">What — kind of action</p>
            <div className="flex flex-wrap gap-1.5">
              {ACTION_TONES.map((t) => (
                <span key={t.key} className={`inline-flex items-center rounded-full border px-2 py-0.5 ${t.className}`} title={t.examples}>
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Activity ─────────────────────────────────────────────────────────────────

function ActivityTab() {
  const role = useUserRole()
  const isUniversityWide = role === "SUPER_ADMIN"
  const { data: departments = [] } = useDepartments()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState("all")
  const [actorRole, setActorRole] = useState("all")
  const [departmentId, setDepartmentId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search, 300)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page) })
    if (action !== "all") p.set("action", action)
    if (actorRole !== "all") p.set("role", actorRole)
    if (departmentId) p.set("departmentId", departmentId)
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (debouncedSearch) p.set("search", debouncedSearch)
    return p
  }, [page, action, actorRole, departmentId, from, to, debouncedSearch])

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
  const filtersActive = action !== "all" || actorRole !== "all" || !!departmentId || !!from || !!to || !!search

  function resetFilters() {
    setAction("all"); setActorRole("all"); setDepartmentId(""); setFrom(""); setTo(""); setSearch(""); setPage(1)
  }

  // Same filters, whole log (up to 5000 rows) as a spreadsheet download.
  const exportHref = `/api/audit-logs?${(() => { const p = new URLSearchParams(params); p.delete("page"); p.set("format", "csv"); return p.toString() })()}`

  const selectClass = "h-9 rounded-lg border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">{isUniversityWide ? "Activity across departments" : "Department activity"}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isUniversityWide
                  ? "Everything done in every department's schedule, newest first. Narrow it with the department filter."
                  : "Everything done in your department, and by your department's people elsewhere, newest first."}
              </p>
            </div>
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
            {isUniversityWide && (
              <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1) }} className={`${selectClass} sm:w-48`} aria-label="Department">
                <option value="">All departments</option>
                {(departments as any[]).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className={`${selectClass} sm:w-40`} aria-label="Action type">
              {ACTION_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <select value={actorRole} onChange={(e) => { setActorRole(e.target.value); setPage(1) }} className={`${selectClass} sm:w-48`} aria-label="Done by role">
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
          <LogLegend />
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
                    const roleStyle = ROLE_BADGE_STYLE[row.actorRole] ?? "bg-gray-100 text-gray-700 border-gray-200"
                    const roleDot = ROLE_DOT_STYLE[row.actorRole] ?? "bg-gray-400"
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
                              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                <DepartmentChip abbreviation={row.schedule.department} title={row.schedule.departmentName} />
                                {row.schedule.term} · {STATUS_LABEL[row.schedule.status] ?? row.schedule.status}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="flex items-center gap-1.5 font-medium">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${roleDot}`} aria-hidden="true" />
                              {row.actorName}
                            </span>
                            <span className={`mt-0.5 inline-flex rounded-full border px-1.5 py-0 text-[10px] ${roleStyle}`}>{formatRole(row.actorRole)}</span>
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
  const role = useUserRole()
  // /api/schedules scopes a Dean / Program Chairperson to their own department
  // server-side; a Department Chairperson sees every department's schedules.
  const { data: active = [], isLoading: loadingActive } = useSchedules(undefined, false)
  const { data: archived = [], isLoading: loadingArchived } = useSchedules(undefined, true)
  const all = useMemo(() => [...(active as any[]), ...(archived as any[])], [active, archived])
  const pager = usePagination(all)
  const isLoading = loadingActive || loadingArchived
  const showDept = role === "SUPER_ADMIN"
  const deptsPresent = useMemo(() => {
    const m = new Map<string, { abbreviation: string; name?: string }>()
    for (const s of all) {
      const abbr = s.department?.abbreviation
      if (abbr && !m.has(abbr)) m.set(abbr, { abbreviation: abbr, name: s.department?.name })
    }
    return [...m.values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
  }, [all])

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <CardTitle className="text-base">{showDept ? "Schedules in every department" : "Schedules in your department"}</CardTitle>
        {showDept && <DepartmentLegend departments={deptsPresent} />}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <TableSkeleton rows={6} cols={5} className="rounded-none border-0" label="Loading schedules" />
        ) : all.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No schedules have been created yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Term</TableHead>
                    {showDept && <TableHead>Department</TableHead>}
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
                      {showDept && <TableCell className="text-sm"><DepartmentChip abbreviation={s.department?.abbreviation} title={s.department?.name} /></TableCell>}
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

// ─── Classes ──────────────────────────────────────────────────────────────────

interface ClassLine {
  id: string
  day: string
  startTime: string
  endTime: string
  set: string | null
  merged: boolean
  subjectCode: string
  subjectTitle: string
  subjectType: string
  units: number | null
  section: string
  sections: string[]
  yearLevel: number | null
  program: string
  programName: string
  faculty: string
  room: string
  building: string
  scheduleId: string
  scheduleStatus: string
  department: string
  departmentName: string
}
interface ClassesPage {
  items: ClassLine[]
  total: number
  page: number
  pageSize: number
  totals: { classes: number; sections: number; programs: number; subjects: number }
  departments: { id: string; abbreviation: string; name: string; college: string }[]
  programs: { id: string; abbreviation: string; name: string; department: string }[]
}

const DAY_SHORT: Record<string, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat" }
const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]

/**
 * Every scheduled class of the term in the reader's scope — one line per
 * class (a merged NSTP class is one line listing all its sections): section,
 * course, subject, faculty, room, day and time, with the department in its
 * colour. Server-paginated with search and filters; Export CSV downloads the
 * filtered list.
 */
function ClassesTab() {
  const role = useUserRole()
  const isUniversityWide = role === "SUPER_ADMIN"
  const { data: semesters = [] } = useSemesters()
  const { data: departments = [] } = useDepartments()
  const activeSemester = useMemo(() => (semesters as any[]).find((s) => s.isActive) ?? (semesters as any[])[0], [semesters])
  const [semesterId, setSemesterId] = useState("")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [departmentId, setDepartmentId] = useState("")
  const [programId, setProgramId] = useState("")
  const [day, setDay] = useState("")
  const [status, setStatus] = useState("")
  const debouncedSearch = useDebounced(search, 300)
  const effectiveSemesterId = semesterId || activeSemester?.id || ""

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page) })
    if (effectiveSemesterId) p.set("semesterId", effectiveSemesterId)
    if (debouncedSearch) p.set("search", debouncedSearch)
    if (departmentId) p.set("departmentId", departmentId)
    if (programId) p.set("programId", programId)
    if (day) p.set("day", day)
    if (status) p.set("status", status)
    return p
  }, [page, effectiveSemesterId, debouncedSearch, departmentId, programId, day, status])

  const { data, isLoading } = useQuery<ClassesPage>({
    queryKey: ["scheduled-classes", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/classes?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load classes")
      return json.data
    },
    staleTime: 15_000,
    enabled: !!effectiveSemesterId,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 20
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const totals = data?.totals
  const filtersActive = !!search || !!departmentId || !!programId || !!day || !!status
  const programOptions = (data?.programs ?? []).filter((p) => !departmentId || departments.some((d: any) => d.id === departmentId && d.abbreviation === p.department))
  const exportHref = `/api/schedules/classes?${(() => { const p = new URLSearchParams(params); p.delete("page"); p.set("format", "csv"); return p.toString() })()}`
  const selectClass = "h-9 rounded-lg border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">{isUniversityWide ? "Every scheduled class, all departments" : "Every scheduled class in your department"}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isLoading || !totals
                  ? "Loading…"
                  : `${totals.classes} class${totals.classes === 1 ? "" : "es"} · ${totals.sections} section${totals.sections === 1 ? "" : "s"} · ${totals.programs} course${totals.programs === 1 ? "" : "s"} · ${totals.subjects} subject${totals.subjects === 1 ? "" : "s"} this term (draft, pending and published schedules)`}
              </p>
            </div>
            <a
              href={exportHref}
              download
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary"
              title="Download the filtered list as a spreadsheet"
            >
              <FileDown className="h-4 w-4" />
              Export CSV
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={effectiveSemesterId} onChange={(e) => { setSemesterId(e.target.value); setPage(1) }} className={selectClass} aria-label="Term">
              {(semesters as any[]).map((s) => (
                <option key={s.id} value={s.id}>{semesterLabel(s)}{s.isActive ? " (active)" : ""}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Subject, section, course, faculty, room…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-9 sm:w-64" />
            </div>
            {isUniversityWide && (
              <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setProgramId(""); setPage(1) }} className={`${selectClass} sm:w-44`} aria-label="Department">
                <option value="">All departments</option>
                {(departments as any[]).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <select value={programId} onChange={(e) => { setProgramId(e.target.value); setPage(1) }} className={`${selectClass} sm:w-44`} aria-label="Course">
              <option value="">All courses</option>
              {programOptions.map((p) => <option key={p.id} value={p.id}>{p.abbreviation} — {p.name}</option>)}
            </select>
            <select value={day} onChange={(e) => { setDay(e.target.value); setPage(1) }} className={selectClass} aria-label="Day">
              <option value="">All days</option>
              {DAY_ORDER.map((d) => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={selectClass} aria-label="Schedule status">
              <option value="">Any status</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="PUBLISHED">Published</option>
            </select>
            {filtersActive && (
              <button type="button" onClick={() => { setSearch(""); setDepartmentId(""); setProgramId(""); setDay(""); setStatus(""); setPage(1) }} className="text-xs font-medium text-[#1B4332] underline underline-offset-2">
                Clear filters
              </button>
            )}
          </div>
          <DepartmentLegend
            departments={data?.departments ?? []}
            extra={<span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3 text-sky-700" /> Merged sections (one NSTP class for several sections)</span>}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} className="rounded-none border-0" label="Loading classes" />
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {filtersActive ? "No classes match these filters." : "No classes have been scheduled for this term yet."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Dept.</TableHead>
                    <TableHead>Course · Section</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead className="w-36">Day · Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell><DepartmentChip abbreviation={c.department} title={c.departmentName} /></TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{c.program}</span>
                        {c.yearLevel && <span className="ml-1 text-xs text-muted-foreground">Year {c.yearLevel}</span>}
                        <span className="block text-xs text-muted-foreground">
                          {c.section}
                          {c.merged && <Badge variant="outline" className="ml-1 border-sky-200 bg-sky-50 text-[10px] text-sky-800">Merged</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-mono text-xs font-semibold">{c.subjectCode}</span>
                        {c.set && <Badge variant="outline" className="ml-1 text-[10px]">Set {c.set}</Badge>}
                        <span className="block max-w-[260px] truncate text-xs text-muted-foreground" title={c.subjectTitle}>{c.subjectTitle}</span>
                      </TableCell>
                      <TableCell className="text-sm">{c.faculty}</TableCell>
                      <TableCell className="text-sm">
                        <span className="font-mono text-xs">{c.room}</span>
                        {c.building && <span className="block text-[10px] text-muted-foreground">{c.building}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        <span className="font-medium">{DAY_SHORT[c.day] ?? c.day}</span>
                        <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{c.startTime}–{c.endTime}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[c.scheduleStatus] ?? ""}`}>
                          {STATUS_LABEL[c.scheduleStatus] ?? c.scheduleStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
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
              label="classes"
              className="border-t px-4 py-3"
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
