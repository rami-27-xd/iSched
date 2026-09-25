"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, BookOpen, GraduationCap, Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { PaginationControls, usePagination } from "@/components/shared/pagination"
import { DepartmentChip, DepartmentLegend } from "@/components/shared/department-legend"
import { TableSkeleton } from "@/components/shared/loading-skeletons"
import { useUserRole } from "@/components/layout/dashboard-shell"
import { useScheduledSemesters, useDepartments } from "@/hooks/use-data"

// ─── Types (shape of GET /api/subjects/summary) ──────────────────────────────

interface ProgramCell {
  programId: string
  program: string
  programName: string
  planned: boolean
  scheduled: boolean
  sections: number
  classes: number
  years: number[]
}
interface DeptCell {
  department: string
  departmentId: string
  departmentName: string
  programs: ProgramCell[]
}
interface SummarySubject {
  code: string
  title: string
  units: number | null
  type: string | null
  owner: string
  isGeneralEducation: boolean
  isPathfit: boolean
  isNstp: boolean
  semesters: Record<string, DeptCell[]>
}
interface SummaryPayload {
  academicYear: { id: string; label: string } | null
  subjects: SummarySubject[]
  departments: { id: string; abbreviation: string; name: string; college: string }[]
}

const SEM_COLUMNS: { key: string; label: string; short: string }[] = [
  { key: "FIRST", label: "1st Semester", short: "1st Sem" },
  { key: "SECOND", label: "2nd Semester", short: "2nd Sem" },
  { key: "SUMMER", label: "Summer", short: "Summer" },
]

type Kind = "all" | "ge" | "major" | "manual"
function kindOf(s: SummarySubject): Exclude<Kind, "all"> {
  if (s.isGeneralEducation) return "ge"
  if (s.isPathfit || s.isNstp) return "manual"
  return "major"
}

const YEAR_LABEL = ["1st", "2nd", "3rd", "4th", "5th"]

// ─── View ─────────────────────────────────────────────────────────────────────

/**
 * Subject Summary (a System Logs tab) — for every subject, which programs
 * (grouped by department) take it in which semester of an academic year, e.g.
 *   1st Semester: GEC05 | CAS — BS Bio, BS Psych | CIT — BSIT
 *   2nd Semester: GEC05 | CAS — BA Comm
 * Read as a matrix (subjects × semesters) or pivoted by program (programs ×
 * semesters, cells = subjects). A chip is filled when the class is actually on
 * a schedule this year, outlined when the curriculum only plans it. Department
 * labels use the shared department colours (lib/department-colors.ts).
 */
export function SubjectSummaryView() {
  const role = useUserRole()
  const isUniversityWide = role === "SUPER_ADMIN"
  const { data: semesters = [] } = useScheduledSemesters()
  const { data: departments = [] } = useDepartments()
  const academicYears = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; startYear: number; isCurrent: boolean }>()
    for (const s of semesters as any[]) {
      const ay = s.academicYear
      if (ay && !seen.has(ay.id)) seen.set(ay.id, { id: ay.id, label: ay.label, startYear: ay.startYear, isCurrent: ay.isCurrent })
    }
    return [...seen.values()].sort((a, b) => b.startYear - a.startYear)
  }, [semesters])
  const [academicYearId, setAcademicYearId] = useState("")
  const [departmentId, setDepartmentId] = useState("")
  const [kind, setKind] = useState<Kind>(isUniversityWide ? "ge" : "all")
  const [scheduledOnly, setScheduledOnly] = useState(false)
  const [search, setSearch] = useState("")
  const effectiveAyId = academicYearId || academicYears.find((a) => a.isCurrent)?.id || academicYears[0]?.id || ""

  const { data, isLoading } = useQuery<SummaryPayload>({
    queryKey: ["subject-summary", effectiveAyId, departmentId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (effectiveAyId) params.set("academicYearId", effectiveAyId)
      if (departmentId) params.set("departmentId", departmentId)
      const res = await fetch(`/api/subjects/summary?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load subject summary")
      return json.data
    },
    staleTime: 30_000,
  })

  const subjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.subjects ?? []).filter((s) => {
      if (kind !== "all" && kindOf(s) !== kind) return false
      if (scheduledOnly && !Object.values(s.semesters).some((cells) => cells.some((d) => d.programs.some((p) => p.scheduled)))) return false
      if (q && !(s.code.toLowerCase().includes(q) || s.title.toLowerCase().includes(q))) return false
      return true
    })
  }, [data, kind, scheduledOnly, search])

  const hasSummer = useMemo(() => subjects.some((s) => (s.semesters.SUMMER?.length ?? 0) > 0), [subjects])
  const columns = SEM_COLUMNS.filter((c) => c.key !== "SUMMER" || hasSummer)

  const selectClass = "h-9 rounded-lg border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={effectiveAyId} onChange={(e) => setAcademicYearId(e.target.value)} className={selectClass} aria-label="Academic year">
          {academicYears.map((a) => (
            <option key={a.id} value={a.id}>A.Y. {a.label}{a.isCurrent ? " (current)" : ""}</option>
          ))}
        </select>
        {isUniversityWide && (
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={selectClass} aria-label="Department">
            <option value="">All departments</option>
            {(departments as any[]).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={selectClass} aria-label="Subject kind">
          <option value="all">All subjects</option>
          <option value="ge">GEC/GEL only</option>
          <option value="major">Major subjects only</option>
          <option value="manual">PATHFit / NSTP only</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={scheduledOnly} onChange={(e) => setScheduledOnly(e.target.checked)} className="rounded border-input" />
          Scheduled only
        </label>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search code or title…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 sm:w-56" />
        </div>
      </div>

      {/* Legend — department colours, then chip states */}
      <DepartmentLegend departments={data?.departments ?? []} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <span className="flex items-center gap-1 font-medium text-muted-foreground"><Info className="h-3.5 w-3.5" /> Chips:</span>
        <span className="inline-flex items-center gap-1.5">
          <ProgramChip cell={{ programId: "x", program: "BSIT", programName: "", planned: true, scheduled: true, sections: 3, classes: 9, years: [1] }} demo />
          Scheduled this year (sections with the class)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ProgramChip cell={{ programId: "y", program: "BSIT", programName: "", planned: true, scheduled: false, sections: 0, classes: 0, years: [1] }} demo />
          In the curriculum, not scheduled yet
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ProgramChip cell={{ programId: "z", program: "BSIT", programName: "", planned: false, scheduled: true, sections: 1, classes: 3, years: [] }} demo />
          Scheduled
        </span>
        <span className="text-muted-foreground">Hover a chip for year level, sections and classes.</span>
      </div>

      <Tabs defaultValue="subject">
        <TabsList>
          <TabsTrigger value="subject"><BookOpen className="mr-1.5 h-4 w-4" />By subject</TabsTrigger>
          <TabsTrigger value="program"><GraduationCap className="mr-1.5 h-4 w-4" />By program</TabsTrigger>
        </TabsList>
        <TabsContent value="subject" className="mt-4">
          {isLoading ? (
            <TableSkeleton rows={8} cols={3} label="Loading subject summary" />
          ) : (
            <SubjectMatrix subjects={subjects} columns={columns} academicYear={data?.academicYear?.label ?? ""} />
          )}
        </TabsContent>
        <TabsContent value="program" className="mt-4">
          {isLoading ? (
            <TableSkeleton rows={8} cols={3} label="Loading subject summary" />
          ) : (
            <ProgramPivot subjects={subjects} columns={columns} departments={data?.departments ?? []} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function ProgramChip({ cell, demo = false }: { cell: ProgramCell; demo?: boolean }) {
  const cls = cell.scheduled
    ? cell.planned
      ? "border-[#1B4332] bg-[#1B4332] text-white"
      : "border-amber-500 bg-amber-100 text-amber-900"
    : "border-border bg-background text-muted-foreground"
  const years = cell.years.length ? cell.years.map((y) => YEAR_LABEL[y - 1] ?? `${y}th`).join("/") + " year" : "year not in curriculum"
  const title = demo
    ? undefined
    : `${cell.programName || cell.program} · ${years}${cell.scheduled ? ` · ${cell.sections} section${cell.sections === 1 ? "" : "s"} · ${cell.classes} class row${cell.classes === 1 ? "" : "s"}` : " · not scheduled yet"}`
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight ${cls}`} title={title}>
      {cell.program}
      {cell.scheduled && !demo && (
        <span className={`rounded-full px-1 text-[9px] ${cell.planned ? "bg-white/25" : "bg-amber-200"}`}>{cell.sections}</span>
      )}
    </span>
  )
}

function SubjectKindBadge({ s }: { s: SummarySubject }) {
  const k = kindOf(s)
  const cls = k === "ge" ? "bg-emerald-100 text-emerald-800" : k === "manual" ? "bg-sky-100 text-sky-800" : "bg-[#D4AF37]/20 text-[#7A5A0E]"
  const label = k === "ge" ? "GEC/GEL" : k === "manual" ? (s.isNstp ? "NSTP" : "PATHFit") : `Major · ${s.owner || "—"}`
  return <span className={`inline-flex rounded-full px-1.5 py-0 text-[9px] font-semibold ${cls}`}>{label}</span>
}

// ─── By subject ───────────────────────────────────────────────────────────────

function SubjectMatrix({ subjects, columns, academicYear }: { subjects: SummarySubject[]; columns: typeof SEM_COLUMNS; academicYear: string }) {
  const pager = usePagination(subjects)
  if (subjects.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No subjects match these filters{academicYear ? ` for A.Y. ${academicYear}` : ""}.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="sticky left-0 z-10 w-64 bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Subject</th>
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((s) => (
                <tr key={s.code} className="border-t align-top hover:bg-muted/20">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold">{s.code}</span>
                      <SubjectKindBadge s={s} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground" title={s.title}>{s.title}</p>
                    {s.units != null && <p className="text-[10px] text-muted-foreground">{s.units} unit{s.units === 1 ? "" : "s"} · {s.type === "LABORATORY" ? "Laboratory" : "Lecture"}</p>}
                  </td>
                  {columns.map((c) => {
                    const cells = s.semesters[c.key] ?? []
                    return (
                      <td key={c.key} className="px-3 py-2.5">
                        {cells.length === 0 ? (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {cells.map((d) => (
                              <li key={d.departmentId} className="flex flex-wrap items-center gap-1.5">
                                <DepartmentChip abbreviation={d.department} title={d.departmentName} />
                                <span className="text-muted-foreground/60">|</span>
                                {d.programs.map((p) => <ProgramChip key={p.programId} cell={p} />)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={pager.page}
          pageCount={pager.pageCount}
          onPageChange={pager.setPage}
          total={pager.total}
          from={pager.from}
          to={pager.to}
          label="subjects"
          className="border-t px-4 py-3"
        />
      </CardContent>
    </Card>
  )
}

// ─── By program ───────────────────────────────────────────────────────────────

function ProgramPivot({
  subjects,
  columns,
  departments,
}: {
  subjects: SummarySubject[]
  columns: typeof SEM_COLUMNS
  departments: SummaryPayload["departments"]
}) {
  // program → semester → subject chips (with year + scheduled state)
  const rows = useMemo(() => {
    const byProgram = new Map<string, { programId: string; program: string; programName: string; department: string; departmentId: string; cells: Record<string, { code: string; years: number[]; scheduled: boolean; planned: boolean }[]> }>()
    for (const s of subjects) {
      for (const [sem, cells] of Object.entries(s.semesters)) {
        for (const d of cells) {
          for (const p of d.programs) {
            if (!byProgram.has(p.programId)) {
              byProgram.set(p.programId, { programId: p.programId, program: p.program, programName: p.programName, department: d.department, departmentId: d.departmentId, cells: {} })
            }
            const r = byProgram.get(p.programId)!
            ;(r.cells[sem] ??= []).push({ code: s.code, years: p.years, scheduled: p.scheduled, planned: p.planned })
          }
        }
      }
    }
    for (const r of byProgram.values()) {
      for (const list of Object.values(r.cells)) {
        list.sort((a, b) => (a.years[0] ?? 9) - (b.years[0] ?? 9) || a.code.localeCompare(b.code, undefined, { numeric: true }))
      }
    }
    return [...byProgram.values()].sort((a, b) => a.department.localeCompare(b.department) || a.program.localeCompare(b.program))
  }, [subjects])
  const pager = usePagination(rows)

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">No programs match these filters.</CardContent>
      </Card>
    )
  }
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? ""

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="sticky left-0 z-10 w-56 bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Program</th>
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((r) => (
                <tr key={r.programId} className="border-t align-top hover:bg-muted/20">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2.5">
                    <p className="text-xs font-semibold">{r.program}</p>
                    <p className="text-[11px] text-muted-foreground" title={r.programName}>{r.programName}</p>
                    <p className="mt-1"><DepartmentChip abbreviation={r.department} title={deptName(r.departmentId)} /></p>
                  </td>
                  {columns.map((c) => {
                    const list = r.cells[c.key] ?? []
                    // Group by year level so a program's term reads like its curriculum sheet.
                    const byYear = new Map<number, typeof list>()
                    for (const item of list) {
                      const y = item.years[0] ?? 0
                      if (!byYear.has(y)) byYear.set(y, [])
                      byYear.get(y)!.push(item)
                    }
                    return (
                      <td key={c.key} className="px-3 py-2.5">
                        {list.length === 0 ? (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {[...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, items]) => (
                              <li key={y} className="flex flex-wrap items-center gap-1.5">
                                <span className="w-14 shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">{y ? `${YEAR_LABEL[y - 1] ?? y} yr` : "—"}</span>
                                {items.map((item) => (
                                  <span
                                    key={item.code}
                                    className={`inline-flex rounded-md border px-1.5 py-0.5 font-mono text-[11px] ${
                                      item.scheduled
                                        ? item.planned ? "border-[#1B4332] bg-[#1B4332] text-white" : "border-amber-500 bg-amber-100 text-amber-900"
                                        : "border-border bg-background text-muted-foreground"
                                    }`}
                                    title={item.scheduled ? "Scheduled this year" : "Planned in the curriculum, not scheduled yet"}
                                  >
                                    {item.code}
                                  </span>
                                ))}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={pager.page}
          pageCount={pager.pageCount}
          onPageChange={pager.setPage}
          total={pager.total}
          from={pager.from}
          to={pager.to}
          label="programs"
          className="border-t px-4 py-3"
        />
      </CardContent>
    </Card>
  )
}
