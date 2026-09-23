"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Building2, DoorOpen, Clock, LayoutGrid, Rows3, Search, X, Users, FileDown, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CardListSkeleton } from "@/components/shared/loading-skeletons"
import { useScheduledSemesters } from "@/hooks/use-data"
import { useUserRole } from "@/components/layout/dashboard-shell"
import { DAY_LABELS } from "@/lib/constants"
import { departmentColor, type DeptColor } from "@/lib/department-colors"
import { DepartmentLegend } from "@/components/shared/department-legend"
import { buildRoomOccupancyHtml, fetchLogoDataUrl, openPrintWindow } from "@/lib/exports/schedule-format"
import { toast } from "sonner"

// ─── Types (shape of GET /api/rooms/occupancy) ───────────────────────────────

export interface OccupancyBlock {
  id: string
  day: string
  startTime: string
  endTime: string
  set: string | null
  merged: boolean
  subjectCode: string
  subjectTitle: string
  subjectType: string
  section: string
  sections: string[]
  program: string
  faculty: string
  scheduleId: string
  scheduleStatus: string
  departmentId: string
  department: string
  departmentName: string
}

export interface RoomOccupancy {
  id: string
  code: string
  name: string
  type: string
  isActive: boolean
  occupancy: OccupancyBlock[]
}

export interface BuildingOccupancy {
  id: string
  code: string
  name: string
  restrictedTo: string[]
  rooms: RoomOccupancy[]
}

interface OccupancyPayload {
  semester: { id: string; type: string; academicYear: string | null } | null
  buildings: BuildingOccupancy[]
  departments: { id: string; abbreviation: string; name: string; college: string }[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
const DAY_FULL: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday",
}
// The grid's time axis: 07:00 → 21:00 in 30-minute columns (same window as the
// Manage Schedules calendar).
const GRID_START_MIN = 7 * 60
const GRID_END_MIN = 21 * 60
const SLOT_MIN = 30
const SLOT_COUNT = (GRID_END_MIN - GRID_START_MIN) / SLOT_MIN // 28
const LABEL_COL_PX = 168
const SLOT_COL_PX = 30

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

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function semesterLabel(s: any): string {
  const type = s?.type === "FIRST" ? "1st Semester" : s?.type === "SECOND" ? "2nd Semester" : s?.type === "SUMMER" ? "Summer" : ""
  return `${type} ${s?.academicYear?.label ?? ""}`.trim()
}

function todayWeekday(): string {
  const d = new Date().getDay() // 0 = Sunday
  return DAY_ORDER[d - 1] ?? "MONDAY"
}

// ─── View ────────────────────────────────────────────────────────────────────

/**
 * Room occupancy — every class held this term in the rooms this user may see,
 * as a colour-coded room × time grid (one row per room, one column per half
 * hour, one colour per department — lib/department-colors.ts) or as a plain
 * list. A System Logs tab for the Dean, Department Chairperson and Program
 * Chairperson (the API decides which buildings each role sees).
 */
export function RoomOccupancyView({ compact = false }: { compact?: boolean }) {
  const role = useUserRole()
  const { data: semesters = [] } = useScheduledSemesters()
  const activeSemester = useMemo(() => (semesters as any[]).find((s) => s.isActive) ?? (semesters as any[])[0], [semesters])
  const [semesterId, setSemesterId] = useState("")
  const [day, setDay] = useState<string>(todayWeekday)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [buildingId, setBuildingId] = useState("")
  const [roomSearch, setRoomSearch] = useState("")
  const [selected, setSelected] = useState<{ block: OccupancyBlock; room: RoomOccupancy; building: BuildingOccupancy } | null>(null)
  const effectiveSemesterId = semesterId || activeSemester?.id || ""

  const { data, isLoading } = useQuery<OccupancyPayload>({
    queryKey: ["room-occupancy", effectiveSemesterId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (effectiveSemesterId) params.set("semesterId", effectiveSemesterId)
      const res = await fetch(`/api/rooms/occupancy?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load room occupancy")
      return json.data
    },
    staleTime: 30_000,
  })

  const allBuildings = data?.buildings ?? []
  const deptList = data?.departments ?? []
  // Colour by department ABBREVIATION (stable across every System Logs tab).
  const colorOf = useMemo(() => {
    const abbrById = new Map(deptList.map((d) => [d.id, d.abbreviation]))
    return (deptId: string): DeptColor => departmentColor(abbrById.get(deptId))
  }, [deptList])

  const buildings = useMemo(() => {
    const q = roomSearch.trim().toLowerCase()
    return allBuildings
      .filter((b) => !buildingId || b.id === buildingId)
      .map((b) => ({
        ...b,
        rooms: b.rooms.filter((r) => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
      }))
      .filter((b) => b.rooms.length > 0 || !q)
  }, [allBuildings, buildingId, roomSearch])

  const totals = useMemo(() => {
    let rooms = 0, classesToday = 0, classesWeek = 0, busyRooms = 0
    for (const b of buildings) for (const r of b.rooms) {
      rooms += 1
      classesWeek += r.occupancy.length
      const today = r.occupancy.filter((o) => o.day === day).length
      classesToday += today
      if (today > 0) busyRooms += 1
    }
    return { rooms, classesToday, classesWeek, busyRooms }
  }, [buildings, day])

  const [exporting, setExporting] = useState(false)

  async function handleExportAllRooms() {
    if (buildings.length === 0) {
      toast.error("No buildings to export")
      return
    }
    setExporting(true)
    try {
      const logo = await fetchLogoDataUrl()
      const semType = data?.semester?.type
      const semesterLabelText =
        semType === "FIRST" ? "1st Semester" : semType === "SECOND" ? "2nd Semester" : semType === "SUMMER" ? "Summer" : ""
      const html = buildRoomOccupancyHtml({
        buildings,
        departments: deptList,
        semesterLabel: semesterLabelText,
        academicYear: data?.semester?.academicYear ?? "",
        logoDataUrl: logo,
        gridStartMin: GRID_START_MIN,
        gridEndMin: GRID_END_MIN,
        slotMin: SLOT_MIN,
      })
      openPrintWindow(html)
    } finally {
      setExporting(false)
    }
  }

  const selectClass = "h-9 rounded-lg border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={effectiveSemesterId} onChange={(e) => setSemesterId(e.target.value)} className={selectClass} aria-label="Term">
            {(semesters as any[]).map((s) => (
              <option key={s.id} value={s.id}>{semesterLabel(s)}{s.isActive ? " (active)" : ""}</option>
            ))}
          </select>
          <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className={selectClass} aria-label="Building">
            <option value="">All buildings</option>
            {allBuildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Find a room…" value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} className="h-9 pl-9 sm:w-44" />
          </div>
          <div className="ml-auto inline-flex rounded-lg border border-input p-0.5" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={view === "grid"}
              onClick={() => setView("grid")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${view === "grid" ? "bg-[#1B4332] text-white" : "text-muted-foreground hover:bg-muted"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "list"}
              onClick={() => setView("list")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${view === "list" ? "bg-[#1B4332] text-white" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Rows3 className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={handleExportAllRooms}
            disabled={exporting || buildings.length === 0}
          >
            {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
            Export All Rooms
          </Button>
        </div>

        {/* Day tabs */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Day">
          {DAY_ORDER.map((d) => {
            const isActive = d === day
            const count = buildings.reduce((n, b) => n + b.rooms.reduce((m, r) => m + r.occupancy.filter((o) => o.day === d).length, 0), 0)
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => { setDay(d); setSelected(null) }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? "border-[#1B4332] bg-[#1B4332] text-white" : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                <span className="sm:hidden">{DAY_LABELS[d]}</span>
                <span className="hidden sm:inline">{DAY_FULL[d]}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>{count}</span>
              </button>
            )
          })}
          <p className="ml-auto text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${totals.busyRooms} of ${totals.rooms} room${totals.rooms === 1 ? "" : "s"} in use on ${DAY_FULL[day]} · ${totals.classesToday} class${totals.classesToday === 1 ? "" : "es"} (${totals.classesWeek} this week)`}
          </p>
        </div>

        {/* Legend */}
        <DepartmentLegend
          departments={deptList}
          extra={
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-gray-400 bg-white" />
                Free
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border-2 border-dashed" style={{ borderColor: "#1B4332", background: "#DCEBE3" }} />
                Not yet published (draft / pending)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3 w-3 text-sky-700" /> Merged sections
              </span>
            </>
          }
        />
      </div>

      {isLoading ? (
        <CardListSkeleton count={3} label="Loading room occupancy" />
      ) : buildings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {roomSearch
              ? "No room matches that search."
              : role === "DEAN"
                ? "No buildings are assigned to your department yet. Assign buildings under Buildings to see who uses their rooms."
                : "No buildings to show yet."}
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        buildings.map((b) => (
          <Card key={b.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-[#1B4332]" />
                {b.name}
                <span className="text-xs font-normal text-muted-foreground">
                  {b.code} · {b.rooms.length} room{b.rooms.length === 1 ? "" : "s"}
                  {b.restrictedTo.length > 0 ? ` · reserved for ${b.restrictedTo.join(", ")}` : " · shared"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className={compact ? "p-0 pb-3" : "pt-0"}>
              {b.rooms.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">No rooms in this building.</p>
              ) : (
                <OccupancyGrid
                  building={b}
                  day={day}
                  colorOf={colorOf}
                  selectedId={selected?.block.id ?? null}
                  onSelect={(block, room) => setSelected(selected?.block.id === block.id ? null : { block, room, building: b })}
                />
              )}
              {selected && selected.building.id === b.id && (
                <SelectedBlock selection={selected} colorOf={colorOf} onClose={() => setSelected(null)} />
              )}
            </CardContent>
          </Card>
        ))
      ) : (
        buildings.map((b) => (
          <Card key={b.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
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
                    .filter((o) => o.day === day)
                    .sort((a, c) => a.startTime.localeCompare(c.startTime))
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
                        <span className="text-xs text-muted-foreground">{rows.length} class{rows.length === 1 ? "" : "es"}</span>
                      </div>
                      {rows.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">Free on {DAY_FULL[day]}.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-28">Time</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead>Section</TableHead>
                                <TableHead>Faculty</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((o) => {
                                const c = colorOf(o.departmentId)
                                return (
                                  <TableRow key={o.id}>
                                    <TableCell className="whitespace-nowrap text-xs">
                                      <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{o.startTime}–{o.endTime}</span>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      <span className="font-medium">{o.subjectCode}</span>
                                      {o.set && <Badge variant="outline" className="ml-1 text-[10px]">Set {o.set}</Badge>}
                                      <span className="block text-xs text-muted-foreground">{o.subjectTitle}</span>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {o.section}
                                      {o.merged && <Badge variant="outline" className="ml-1 border-sky-200 bg-sky-50 text-[10px] text-sky-800">Merged</Badge>}
                                    </TableCell>
                                    <TableCell className="text-sm">{o.faculty}</TableCell>
                                    <TableCell className="text-sm">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className="inline-block h-2.5 w-2.5 rounded-sm border" style={{ background: c.bg, borderColor: c.border }} />
                                        {o.department}
                                      </span>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[o.scheduleStatus] ?? ""}`}>
                                        {STATUS_LABEL[o.scheduleStatus] ?? o.scheduleStatus}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
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

// ─── Grid ────────────────────────────────────────────────────────────────────

function OccupancyGrid({
  building,
  day,
  colorOf,
  selectedId,
  onSelect,
}: {
  building: BuildingOccupancy
  day: string
  colorOf: (deptId: string) => DeptColor
  selectedId: string | null
  onSelect: (block: OccupancyBlock, room: RoomOccupancy) => void
}) {
  const hourLabels = Array.from({ length: SLOT_COUNT / 2 }, (_, i) => {
    const h = 7 + i
    const suffix = h >= 12 ? "PM" : "AM"
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12} ${suffix}`
  })

  return (
    <div className="overflow-x-auto">
      <div
        className="relative text-xs"
        style={{
          display: "grid",
          gridTemplateColumns: `${LABEL_COL_PX}px repeat(${SLOT_COUNT}, minmax(${SLOT_COL_PX}px, 1fr))`,
          minWidth: LABEL_COL_PX + SLOT_COUNT * SLOT_COL_PX,
        }}
      >
        {/* Header row */}
        <div className="sticky left-0 z-20 border-b border-r bg-muted/60 px-3 py-1.5 font-semibold text-muted-foreground" style={{ gridRow: 1, gridColumn: 1 }}>
          Room
        </div>
        {hourLabels.map((label, i) => (
          <div
            key={label}
            className="border-b border-l bg-muted/60 px-1 py-1.5 text-center text-[10px] font-medium text-muted-foreground"
            style={{ gridRow: 1, gridColumn: `${2 + i * 2} / span 2` }}
          >
            {label}
          </div>
        ))}

        {building.rooms.map((room, ri) => {
          const row = ri + 2
          const blocks = room.occupancy.filter((o) => o.day === day)
          return (
            <RoomRow key={room.id} room={room} row={row} blocks={blocks} colorOf={colorOf} selectedId={selectedId} onSelect={onSelect} />
          )
        })}
      </div>
    </div>
  )
}

function RoomRow({
  room,
  row,
  blocks,
  colorOf,
  selectedId,
  onSelect,
}: {
  room: RoomOccupancy
  row: number
  blocks: OccupancyBlock[]
  colorOf: (deptId: string) => DeptColor
  selectedId: string | null
  onSelect: (block: OccupancyBlock, room: RoomOccupancy) => void
}) {
  const busyMinutes = blocks.reduce((sum, b) => sum + Math.max(0, toMinutes(b.endTime) - toMinutes(b.startTime)), 0)
  return (
    <>
      {/* Room label (sticky) */}
      <div
        className="sticky left-0 z-10 flex min-h-[44px] flex-col justify-center border-b border-r bg-card px-3 py-1"
        style={{ gridRow: row, gridColumn: 1 }}
      >
        <span className="flex items-center gap-1.5 font-medium">
          <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
          {room.code}
          {!room.isActive && <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">inactive</span>}
        </span>
        <span className="truncate text-[10px] text-muted-foreground" title={room.name}>
          {room.name} · {room.type.replace(/_/g, " ").toLowerCase()}
          {busyMinutes > 0 ? ` · ${Math.round((busyMinutes / 60) * 10) / 10} h` : " · free"}
        </span>
      </div>
      {/* Free cells (hour boundaries drawn stronger) */}
      {Array.from({ length: SLOT_COUNT }, (_, i) => (
        <div
          key={i}
          className={`min-h-[44px] border-b ${i % 2 === 0 ? "border-l border-l-border" : "border-l border-l-border/40"}`}
          style={{ gridRow: row, gridColumn: 2 + i }}
          aria-hidden="true"
        />
      ))}
      {/* Class blocks */}
      {blocks.map((b) => {
        const startCol = Math.max(0, Math.floor((toMinutes(b.startTime) - GRID_START_MIN) / SLOT_MIN))
        const endCol = Math.min(SLOT_COUNT, Math.ceil((toMinutes(b.endTime) - GRID_START_MIN) / SLOT_MIN))
        const span = Math.max(1, endCol - startCol)
        if (endCol <= 0 || startCol >= SLOT_COUNT) return null
        const c = colorOf(b.departmentId)
        const unpublished = b.scheduleStatus !== "PUBLISHED"
        const isSelected = selectedId === b.id
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b, room)}
            title={`${b.subjectCode} — ${b.subjectTitle}\n${b.section}${b.set ? ` (Set ${b.set})` : ""} · ${b.faculty}\n${b.startTime}–${b.endTime} · ${b.department} · ${STATUS_LABEL[b.scheduleStatus] ?? b.scheduleStatus}`}
            className={`z-[5] m-0.5 flex min-w-0 flex-col justify-center overflow-hidden rounded-md px-1.5 py-0.5 text-left leading-tight transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring ${isSelected ? "ring-2 ring-offset-1" : ""}`}
            style={{
              gridRow: row,
              gridColumn: `${2 + startCol} / span ${span}`,
              background: c.bg,
              color: c.fg,
              border: `${unpublished ? "2px dashed" : "1px solid"} ${c.border}`,
              ...(isSelected ? { boxShadow: `0 0 0 2px ${c.border}` } : {}),
            }}
            aria-label={`${b.subjectCode} ${b.section} ${b.startTime} to ${b.endTime}, ${b.departmentName}`}
          >
            <span className="flex items-center gap-1 truncate text-[11px] font-semibold">
              {b.subjectCode}
              {b.set && <span className="rounded bg-white/60 px-1 text-[9px] font-medium">Set {b.set}</span>}
              {b.merged && <Users className="h-3 w-3 shrink-0" />}
            </span>
            {span >= 2 && <span className="truncate text-[10px]">{b.section}</span>}
            {span >= 3 && <span className="truncate text-[10px] opacity-80">{b.faculty}</span>}
          </button>
        )
      })}
    </>
  )
}

function SelectedBlock({
  selection,
  colorOf,
  onClose,
}: {
  selection: { block: OccupancyBlock; room: RoomOccupancy; building: BuildingOccupancy }
  colorOf: (deptId: string) => DeptColor
  onClose: () => void
}) {
  const { block: b, room } = selection
  const c = colorOf(b.departmentId)
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: c.border, background: `${c.bg}66` }}>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold" style={{ color: c.fg }}>
          {b.subjectCode} — {b.subjectTitle}
          {b.set && <Badge variant="outline" className="ml-1.5 text-[10px]">Set {b.set}</Badge>}
        </p>
        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-muted-foreground">Room</dt><dd>{room.code} · {room.name}</dd></div>
          <div><dt className="text-muted-foreground">When</dt><dd>{DAY_FULL[b.day] ?? b.day}, {b.startTime}–{b.endTime}</dd></div>
          <div><dt className="text-muted-foreground">Section{b.sections.length > 1 ? "s (merged)" : ""}</dt><dd>{b.sections.length > 1 ? b.sections.join(" + ") : b.section}{b.program ? ` · ${b.program}` : ""}</dd></div>
          <div><dt className="text-muted-foreground">Faculty</dt><dd>{b.faculty}</dd></div>
          <div><dt className="text-muted-foreground">Department</dt><dd>{b.departmentName || b.department}</dd></div>
          <div>
            <dt className="text-muted-foreground">Schedule status</dt>
            <dd><Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[b.scheduleStatus] ?? ""}`}>{STATUS_LABEL[b.scheduleStatus] ?? b.scheduleStatus}</Badge></dd>
          </div>
        </dl>
      </div>
      <button type="button" onClick={onClose} className="self-start rounded p-1 text-muted-foreground hover:bg-black/5" aria-label="Close details">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
