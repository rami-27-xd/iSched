"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Loader2, Plus, MoreHorizontal, Pencil, UserMinus, Search, ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { useFacultyList, useCreateFaculty, useUpdateFaculty, useSemesters } from "@/hooks/use-data"
import { useCollege } from "@/lib/college-context"
import { RoleGuard } from "@/components/shared/role-guard"
import { PageHeader } from "@/components/shared/page-header"
import { CollegeFilter } from "@/components/layout/college-filter"
import { PaginationControls, usePagination } from "@/components/shared/pagination"

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const
const DAY_SHORT: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
}
const DAY_LABELS: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
}

// 30-min slots from 07:30 to 21:00 (27 slots)
const SLOTS = Array.from({ length: 27 }, (_, i) => {
  const totalMins = 7 * 60 + 30 + i * 30
  const h = String(Math.floor(totalMins / 60)).padStart(2, "0")
  const m = String(totalMins % 60).padStart(2, "0")
  return `${h}:${m}`
})

function getEndTime(startTime: string): string {
  const [hStr, mStr] = startTime.split(":")
  const totalMins = parseInt(hStr) * 60 + parseInt(mStr) + 30
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(":")
  let h = parseInt(hStr)
  const ampm = h >= 12 ? "PM" : "AM"
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${ampm}`
}

/** Merge overlapping/adjacent intervals and return sorted merged list */
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1])
    } else {
      merged.push(sorted[i])
    }
  }
  return merged
}

function minsToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

// ─── SLSU brand colors ────────────────────────────────────────────────────────
const BRAND_GREEN = "#1B4332"
const BRAND_GOLD = "#D4AF37"

// ─── Workload helpers ─────────────────────────────────────────────────────────

/** "4", "4.5" — hours from minutes, no trailing ".0". */
function fmtHours(mins: number): string {
  const h = mins / 60
  return Number.isInteger(h) ? `${h}` : h.toFixed(1)
}

/** Slot index → contiguous [start, end] (inclusive) blocks. */
function toBlocks(indices: number[]): [number, number][] {
  const sorted = [...indices].sort((a, b) => a - b)
  const blocks: [number, number][] = []
  for (const i of sorted) {
    const last = blocks[blocks.length - 1]
    if (last && i === last[1] + 1) last[1] = i
    else blocks.push([i, i])
  }
  return blocks
}

// Hatched red fill for "would exceed max hours" cells.
const BLOCKED_BG = "repeating-linear-gradient(45deg, rgba(239,68,68,0.45) 0 4px, rgba(239,68,68,0.12) 4px 8px)"

function WorkloadBar({
  label,
  minutes,
  maxMinutes,
  color,
}: {
  label: string
  minutes: number
  maxMinutes: number
  color: string
}) {
  const pct = maxMinutes > 0 ? Math.min(100, (minutes / maxMinutes) * 100) : 0
  const over = maxMinutes > 0 && minutes > maxMinutes
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold tabular-nums ${over ? "text-red-600" : "text-foreground"}`}>
          {fmtHours(minutes)} / {fmtHours(maxMinutes)} h
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: over ? "#DC2626" : color }}
        />
      </div>
    </div>
  )
}

// ─── Faculty Card Component ───────────────────────────────────────────────────

function FacultyCard({
  faculty,
  availabilityMap,
  allAvailability,
  scheduledMinutes,
  onSave,
  isSaving,
  onSaveMaxHours,
  isSavingMaxHours,
  onEdit,
  onDeactivate,
}: {
  faculty: any
  availabilityMap: Map<string, Set<string>>
  allAvailability: any[]
  /** Minutes of classes already scheduled for this faculty this semester (live). */
  scheduledMinutes: number
  onSave: (facultyId: string, newSlots: { day: string; startTime: string; endTime: string }[]) => void
  isSaving: boolean
  onSaveMaxHours: (facultyId: string, hours: number) => void
  isSavingMaxHours: boolean
  onEdit?: (faculty: any) => void
  onDeactivate?: (faculty: any) => void
}) {
  const [activeDay, setActiveDay] = useState<string>("MONDAY")
  const dragRef = useRef<{ dragging: boolean; startIdx: number; endIdx: number; mode: "add" | "remove" } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ startIdx: number; endIdx: number; mode: "add" | "remove" } | null>(null)
  // Cell under the pointer (not dragging) — drives the cap-aware hover state
  // and the "expanded" look of the availability block it belongs to.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  // Resize-by-dragging a block's end handle.
  const timelineRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ start: number; end: number; side: "start" | "end"; cur: number } | null>(null)
  const [resizePreview, setResizePreview] = useState<{ start: number; end: number; side: "start" | "end"; cur: number } | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const facultySlots = useMemo(
    () => availabilityMap.get(faculty.id) ?? new Set<string>(),
    [availabilityMap, faculty.id],
  )

  const firstName = faculty.user?.firstName ?? ""
  const lastName = faculty.user?.lastName ?? ""
  const department = faculty.department?.name ?? ""
  const fullName = `${lastName}${firstName ? `, ${firstName}` : ""}`

  // ─── Workload vs. the max-hours cap ───────────────────────────────────
  // Every marked 30-min slot across the whole week counts toward the cap.
  const maxHours = Number(faculty.maxHoursPerWeek ?? 30) || 30
  const capMinutes = maxHours * 60
  const markedMinutes = facultySlots.size * 30
  const remainingSlots = Math.max(0, Math.floor((capMinutes - markedMinutes) / 30))
  const atCap = remainingSlots === 0

  const [maxHoursDraft, setMaxHoursDraft] = useState<string>(String(maxHours))
  useEffect(() => { setMaxHoursDraft(String(maxHours)) }, [maxHours])
  const commitMaxHours = useCallback(() => {
    const n = Number(maxHoursDraft)
    if (!Number.isFinite(n) || n < 1 || n > 60) {
      toast.error("Max hours must be between 1 and 60")
      setMaxHoursDraft(String(maxHours))
      return
    }
    if (n !== maxHours) onSaveMaxHours(faculty.id, n)
  }, [maxHoursDraft, maxHours, onSaveMaxHours, faculty.id])

  // ─── Per-day breakdown (summary card) ─────────────────────────────────
  const dayBreakdown = useMemo(() => {
    return DAYS.map((day) => {
      const idxs = SLOTS.map((s, i) => (facultySlots.has(`${day}-${s}`) ? i : -1)).filter((i) => i >= 0)
      const ranges = toBlocks(idxs).map(([a, b]) => `${formatTime12(SLOTS[a])}–${formatTime12(getEndTime(SLOTS[b]))}`)
      return { day, ranges, minutes: idxs.length * 30 }
    })
  }, [facultySlots])
  const summary = useMemo(() => {
    const parts = dayBreakdown.filter((d) => d.ranges.length > 0).map((d) => `${DAY_SHORT[d.day]}: ${d.ranges.join(", ")}`)
    return parts.length > 0 ? parts.join(" | ") : "No availability set"
  }, [dayBreakdown])

  // Selected slot indices + merged blocks for the active day.
  const daySelected = useMemo(() => {
    const set = new Set<number>()
    for (let i = 0; i < SLOTS.length; i++) if (facultySlots.has(`${activeDay}-${SLOTS[i]}`)) set.add(i)
    return set
  }, [facultySlots, activeDay])
  const dayBlocks = useMemo(() => toBlocks([...daySelected]), [daySelected])

  // ─── Compute new slots after a bulk change for one day ────────────────
  const buildNewSlots = useCallback(
    (day: string, selectedIndices: Set<number>) => {
      const currentSlots = allAvailability
        .filter((a: any) => a.facultyId === faculty.id)
        .map((a: any) => ({ day: a.day, startTime: a.startTime, endTime: a.endTime }))

      const otherDaySlots = currentSlots.filter((s) => s.day !== day)

      const intervals: [number, number][] = []
      for (const idx of selectedIndices) {
        const [h, m] = SLOTS[idx].split(":").map(Number)
        const start = h * 60 + m
        intervals.push([start, start + 30])
      }
      const merged = mergeIntervals(intervals)

      const daySlots = merged.map(([s, e]) => ({
        day,
        startTime: minsToTimeStr(s),
        endTime: minsToTimeStr(e),
      }))

      return [...otherDaySlots, ...daySlots]
    },
    [allAvailability, faculty.id],
  )

  const commitDaySlots = useCallback(
    (day: string, newSelectedIndices: Set<number>) => {
      const newSlots = buildNewSlots(day, newSelectedIndices)
      onSave(faculty.id, newSlots)
    },
    [buildNewSlots, faculty.id, onSave],
  )

  /**
   * Adds `candidates` (in the given order) to `selected` until the max-hours
   * cap is reached. Returns how many were left out so the caller can say so.
   */
  const addWithinCap = useCallback(
    (selected: Set<number>, candidates: number[]): number => {
      let room = remainingSlots
      let blocked = 0
      for (const i of candidates) {
        if (selected.has(i)) continue
        if (room > 0) { selected.add(i); room-- }
        else blocked++
      }
      return blocked
    },
    [remainingSlots],
  )

  const warnCap = useCallback((blocked: number) => {
    if (blocked > 0) {
      toast.warning(`Max hours reached (${maxHours} h/week) — ${fmtHours(blocked * 30)} h could not be added. Raise the limit in the workload panel to mark more.`)
    }
  }, [maxHours])

  // ─── Drag (paint) handlers ────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (idx: number) => {
      const isCurrentlyOn = daySelected.has(idx)
      const mode = isCurrentlyOn ? "remove" : "add"
      // Nothing can be added once the cap is reached — refuse to start an add-drag.
      if (mode === "add" && atCap) { warnCap(1); return }
      dragRef.current = { dragging: true, startIdx: idx, endIdx: idx, mode }
      setDragPreview({ startIdx: idx, endIdx: idx, mode })
    },
    [daySelected, atCap, warnCap],
  )

  const handleMouseEnter = useCallback((idx: number) => {
    setHoverIdx(idx)
    if (!dragRef.current?.dragging) return
    dragRef.current.endIdx = idx
    setDragPreview({
      startIdx: dragRef.current.startIdx,
      endIdx: idx,
      mode: dragRef.current.mode,
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!dragRef.current?.dragging) return
    const { startIdx, endIdx, mode } = dragRef.current
    dragRef.current = null
    setDragPreview(null)

    const currentSelected = new Set(daySelected)
    // Walk from where the drag started toward where it ended, so when the cap
    // cuts the range short it is the far end that gets dropped — matching the
    // hatched preview the user saw while dragging.
    const step = endIdx >= startIdx ? 1 : -1
    const ordered: number[] = []
    for (let i = startIdx; step > 0 ? i <= endIdx : i >= endIdx; i += step) ordered.push(i)

    if (mode === "add") {
      warnCap(addWithinCap(currentSelected, ordered))
    } else {
      for (const i of ordered) currentSelected.delete(i)
    }
    commitDaySlots(activeDay, currentSelected)
  }, [activeDay, daySelected, commitDaySlots, addWithinCap, warnCap])

  // ─── Resize handles ───────────────────────────────────────────────────
  const idxFromClientX = useCallback((clientX: number): number => {
    const el = timelineRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = (clientX - rect.left) / Math.max(1, rect.width)
    return Math.min(SLOTS.length - 1, Math.max(0, Math.floor(ratio * SLOTS.length)))
  }, [])

  const startResize = useCallback((block: [number, number], side: "start" | "end", e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const st = { start: block[0], end: block[1], side, cur: side === "start" ? block[0] : block[1] }
    resizeRef.current = st
    setResizePreview(st)
  }, [])

  useEffect(() => {
    if (!resizePreview) return
    function onMove(e: MouseEvent) {
      const r = resizeRef.current
      if (!r) return
      const idx = idxFromClientX(e.clientX)
      // A handle can't cross the block's other edge.
      const cur = r.side === "end" ? Math.max(r.start, idx) : Math.min(r.end, idx)
      if (cur !== r.cur) {
        r.cur = cur
        setResizePreview({ ...r })
      }
    }
    function onUp() {
      const r = resizeRef.current
      resizeRef.current = null
      setResizePreview(null)
      if (!r) return
      const newStart = r.side === "start" ? r.cur : r.start
      const newEnd = r.side === "end" ? r.cur : r.end
      const next = new Set(daySelected)
      // Cells the block no longer covers are removed…
      for (let i = r.start; i <= r.end; i++) if (i < newStart || i > newEnd) next.delete(i)
      // …cells it grew into are added, nearest-to-the-old-edge first, within the cap.
      const grown: number[] = []
      if (r.side === "end") for (let i = r.end + 1; i <= newEnd; i++) grown.push(i)
      else for (let i = r.start - 1; i >= newStart; i--) grown.push(i)
      warnCap(addWithinCap(next, grown))
      commitDaySlots(activeDay, next)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [resizePreview, idxFromClientX, daySelected, activeDay, addWithinCap, warnCap, commitDaySlots])

  // ─── Quick buttons ────────────────────────────────────────────────────
  const applyPreset = useCallback(
    (startTime: string, endTime: string) => {
      const currentSelected = new Set(daySelected)
      const [sH, sM] = startTime.split(":").map(Number)
      const [eH, eM] = endTime.split(":").map(Number)
      const startMins = sH * 60 + sM
      const endMins = eH * 60 + eM
      const candidates: number[] = []
      for (let i = 0; i < SLOTS.length; i++) {
        const [h, m] = SLOTS[i].split(":").map(Number)
        const slotMins = h * 60 + m
        if (slotMins >= startMins && slotMins + 30 <= endMins) candidates.push(i)
      }
      warnCap(addWithinCap(currentSelected, candidates))
      commitDaySlots(activeDay, currentSelected)
    },
    [activeDay, daySelected, commitDaySlots, addWithinCap, warnCap],
  )

  const clearDay = useCallback(() => {
    commitDaySlots(activeDay, new Set())
  }, [activeDay, commitDaySlots])

  // ─── Preview sets for rendering ───────────────────────────────────────
  // Drag-add: the first `remainingSlots` NEW cells (from the drag origin
  // outward) will be added; the rest are shown hatched as "would exceed".
  const { dragAllowed, dragBlocked, dragRemove } = useMemo(() => {
    const allowed = new Set<number>(), blocked = new Set<number>(), remove = new Set<number>()
    if (!dragPreview) return { dragAllowed: allowed, dragBlocked: blocked, dragRemove: remove }
    const { startIdx, endIdx, mode } = dragPreview
    const step = endIdx >= startIdx ? 1 : -1
    let room = remainingSlots
    for (let i = startIdx; step > 0 ? i <= endIdx : i >= endIdx; i += step) {
      if (mode === "remove") { remove.add(i); continue }
      if (daySelected.has(i)) { allowed.add(i); continue }
      if (room > 0) { allowed.add(i); room-- } else blocked.add(i)
    }
    return { dragAllowed: allowed, dragBlocked: blocked, dragRemove: remove }
  }, [dragPreview, daySelected, remainingSlots])

  // Resize preview: the block's new extent, with growth beyond the cap hatched.
  const resizeView = useMemo(() => {
    if (!resizePreview) return null
    const r = resizePreview
    const newStart = r.side === "start" ? r.cur : r.start
    const newEnd = r.side === "end" ? r.cur : r.end
    const grown = new Set<number>(), blocked = new Set<number>(), shrunk = new Set<number>()
    let room = remainingSlots
    const walk = r.side === "end"
      ? Array.from({ length: Math.max(0, newEnd - r.end) }, (_, k) => r.end + 1 + k)
      : Array.from({ length: Math.max(0, r.start - newStart) }, (_, k) => r.start - 1 - k)
    for (const i of walk) {
      if (daySelected.has(i)) { grown.add(i); continue }
      if (room > 0) { grown.add(i); room-- } else blocked.add(i)
    }
    for (let i = r.start; i <= r.end; i++) if (i < newStart || i > newEnd) shrunk.add(i)
    return { newStart, newEnd, grown, blocked, shrunk }
  }, [resizePreview, daySelected, remainingSlots])

  const hoveredBlock = hoverIdx !== null ? dayBlocks.find(([a, b]) => hoverIdx >= a && hoverIdx <= b) ?? null : null
  const blockLabel = (a: number, b: number) =>
    `${formatTime12(SLOTS[a])} – ${formatTime12(getEndTime(SLOTS[b]))} · ${fmtHours((b - a + 1) * 30)} h`

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundColor: BRAND_GREEN }}
      >
        <div className="min-w-0">
          <h3 className="font-semibold text-base truncate">{fullName}</h3>
          {department && (
            <p className="text-xs mt-0.5 truncate" style={{ color: BRAND_GOLD }}>
              {department}
            </p>
          )}
        </div>
        {(onEdit || onDeactivate) && (
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 ml-2 text-white/70 hover:text-white hover:bg-white/15"
              />
            }>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(faculty)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Record
                </DropdownMenuItem>
              )}
              {onDeactivate && (
                <DropdownMenuItem
                  onClick={() => onDeactivate(faculty)}
                  className="text-destructive focus:text-destructive"
                >
                  <UserMinus className="mr-2 h-4 w-4" />
                  Deactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <CardContent className="p-4">
        <div className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
          {/* ── Workload sidebar ─────────────────────────────────────────
              Max-hours limit + live workload: hours marked available on
              this timeline, and hours of classes already scheduled this
              semester, both against the limit. */}
          <aside className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label htmlFor={`max-hours-${faculty.id}`} className="text-xs">Max hours / week</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`max-hours-${faculty.id}`}
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={maxHoursDraft}
                  onChange={(e) => setMaxHoursDraft(e.target.value)}
                  onBlur={commitMaxHours}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur() }}
                  disabled={isSavingMaxHours}
                  className="h-8 w-20 text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">hours</span>
                {isSavingMaxHours && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Caps the hours you can mark below and the classes the scheduler may assign.
              </p>
            </div>

            <WorkloadBar label="Available (marked)" minutes={markedMinutes} maxMinutes={capMinutes} color="#22c55e" />
            <WorkloadBar label="Scheduled (classes)" minutes={scheduledMinutes} maxMinutes={capMinutes} color={BRAND_GOLD} />

            <p className={`text-[11px] font-medium ${atCap ? "text-red-600" : "text-muted-foreground"}`}>
              {atCap
                ? "Limit reached — raise it to mark more"
                : `${fmtHours(remainingSlots * 30)} h left to mark`}
            </p>
          </aside>

          <div className="min-w-0 space-y-3">
            {/* Day tabs */}
            <div className="flex gap-1 flex-wrap">
              {DAYS.map((day) => {
                const isActive = activeDay === day
                const hasSlotsForDay = SLOTS.some((s) => facultySlots.has(`${day}-${s}`))
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setActiveDay(day)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors relative"
                    style={{
                      backgroundColor: isActive ? BRAND_GREEN : "transparent",
                      color: isActive ? "#fff" : BRAND_GREEN,
                      border: `1.5px solid ${isActive ? BRAND_GREEN : "#d1d5db"}`,
                    }}
                  >
                    {DAY_SHORT[day]}
                    {hasSlotsForDay && (
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                        style={{ backgroundColor: BRAND_GOLD }}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Quick-action buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => applyPreset("07:30", "12:00")}
                disabled={isSaving || atCap}
                className="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: BRAND_GREEN, color: BRAND_GREEN }}
              >
                Morning (7:30–12:00)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("12:00", "17:00")}
                disabled={isSaving || atCap}
                className="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: BRAND_GREEN, color: BRAND_GREEN }}
              >
                Afternoon (12:00–5:00)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("07:30", "21:00")}
                disabled={isSaving || atCap}
                className="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: BRAND_GREEN, color: BRAND_GREEN }}
              >
                Full Day (7:30–9:00 PM)
              </button>
              <button
                type="button"
                onClick={clearDay}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                Clear {DAY_SHORT[activeDay]}
              </button>
            </div>

            {/* Timeline */}
            <div className="relative select-none overflow-x-auto pt-6" style={{ userSelect: "none" }}>
              <div className="min-w-[600px]">
                {/* Hour labels — anchored to each hour's slot boundary so they sit
                    directly over the gridlines drawn on the cells below. */}
                <div className="relative h-3 mb-0.5 text-[10px] text-muted-foreground">
                  {SLOTS.map((slot, i) => {
                    const [, m] = slot.split(":").map(Number)
                    if (m !== 0) return null
                    return (
                      <span
                        key={i}
                        className="absolute top-0 -translate-x-1/2 whitespace-nowrap tabular-nums"
                        style={{ left: `${(i / SLOTS.length) * 100}%` }}
                      >
                        {formatTime12(slot).replace(":00 ", "").replace(" ", "")}
                      </span>
                    )
                  })}
                </div>

                {/* Timeline slots + block overlays */}
                <div
                  ref={timelineRef}
                  className="relative flex rounded-lg border border-border"
                  onMouseLeave={() => {
                    setHoverIdx(null)
                    if (dragRef.current?.dragging) handleMouseUp()
                  }}
                >
                  {SLOTS.map((slot, idx) => {
                    const isAvailable = daySelected.has(idx)
                    const [, m] = slot.split(":").map(Number)
                    const isHourBoundary = m === 0 && idx > 0
                    const hovered = hoverIdx === idx && !dragPreview && !resizePreview
                    // Hovering an empty cell when nothing more can be added.
                    const hoverBlocked = hovered && !isAvailable && atCap

                    let bg: string = "transparent"
                    let cursor = "pointer"
                    if (resizeView) {
                      if (resizeView.blocked.has(idx)) bg = BLOCKED_BG
                      else if (resizeView.grown.has(idx)) bg = "rgba(34,197,94,0.5)"
                      else if (resizeView.shrunk.has(idx)) bg = "rgba(239,68,68,0.3)"
                      else if (isAvailable) bg = "rgba(34,197,94,0.6)"
                      cursor = "ew-resize"
                    } else if (dragPreview) {
                      if (dragBlocked.has(idx)) bg = BLOCKED_BG
                      else if (dragRemove.has(idx)) bg = "rgba(239,68,68,0.3)"
                      else if (dragAllowed.has(idx)) bg = "rgba(34,197,94,0.5)"
                      else if (isAvailable) bg = "rgba(34,197,94,0.6)"
                    } else if (hoverBlocked) {
                      bg = BLOCKED_BG
                      cursor = "not-allowed"
                    } else if (isAvailable) {
                      bg = "rgba(34,197,94,0.6)"
                    } else if (atCap) {
                      cursor = "not-allowed"
                    }

                    const title = hoverBlocked || (!isAvailable && atCap)
                      ? `Adding this slot would exceed the ${maxHours}-hour weekly limit`
                      : `${DAY_LABELS[activeDay]} ${formatTime12(slot)} – ${formatTime12(getEndTime(slot))} ${isAvailable ? "(Available — drag to remove, or drag a block edge to resize)" : "(Unavailable — click or drag to add)"}`

                    return (
                      <div
                        key={idx}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleMouseDown(idx)
                        }}
                        onMouseEnter={() => handleMouseEnter(idx)}
                        onMouseUp={handleMouseUp}
                        className={`relative transition-all ${hoverBlocked ? "" : "hover:brightness-90"}`}
                        style={{
                          width: `${100 / SLOTS.length}%`,
                          height: "44px",
                          background: bg,
                          cursor,
                          borderLeft: isHourBoundary ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(0,0,0,0.04)",
                        }}
                        title={title}
                      />
                    )
                  })}

                  {/* Block overlays — one per contiguous green run. The body lets
                      pointer events through to the cells (so paint-to-remove still
                      works); the end handles capture them for resizing. Hovering a
                      block "expands" it: raised, outlined, with its range and
                      duration shown above. */}
                  {!dragPreview && dayBlocks.map(([a, b]) => {
                    const isHovered = hoveredBlock?.[0] === a && hoveredBlock?.[1] === b
                    const isResizing = resizePreview?.start === a && resizePreview?.end === b
                    const dispA = isResizing && resizeView ? resizeView.newStart : a
                    const dispB = isResizing && resizeView ? resizeView.newEnd : b
                    const left = (dispA / SLOTS.length) * 100
                    const width = ((dispB - dispA + 1) / SLOTS.length) * 100
                    const wide = dispB - dispA + 1 >= 5
                    const expanded = isHovered || isResizing
                    return (
                      <div
                        key={`${a}-${b}`}
                        className={`pointer-events-none absolute top-0 bottom-0 rounded-md transition-[box-shadow,transform] duration-150 ${
                          expanded ? "z-10 scale-y-110 ring-2 ring-emerald-600/70 shadow-md" : ""
                        }`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        {/* Range label inside the block (only when there is room) */}
                        {wide && (
                          <span className="absolute inset-0 flex items-center justify-center px-1 text-[10px] font-semibold text-emerald-950/80 truncate">
                            {formatTime12(SLOTS[dispA])} – {formatTime12(getEndTime(SLOTS[dispB]))}
                          </span>
                        )}
                        {/* Expanded detail above the block */}
                        {expanded && (
                          <span
                            className="absolute left-1/2 -top-6 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1B4332] px-2 py-0.5 text-[10px] font-medium text-white shadow"
                          >
                            {blockLabel(dispA, dispB)}{isResizing ? "" : " · drag ends to resize"}
                          </span>
                        )}
                        {/* Resize handles */}
                        <div
                          role="separator"
                          aria-label="Resize start"
                          onMouseDown={(e) => startResize([a, b], "start", e)}
                          className={`pointer-events-auto absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md bg-emerald-700/70 transition-opacity ${
                            expanded ? "opacity-100" : "opacity-0 hover:opacity-100"
                          }`}
                        />
                        <div
                          role="separator"
                          aria-label="Resize end"
                          onMouseDown={(e) => startResize([a, b], "end", e)}
                          className={`pointer-events-auto absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md bg-emerald-700/70 transition-opacity ${
                            expanded ? "opacity-100" : "opacity-0 hover:opacity-100"
                          }`}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Start/End labels */}
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 px-0.5">
                  <span>{formatTime12(SLOTS[0])}</span>
                  <span>{formatTime12(getEndTime(SLOTS[SLOTS.length - 1]))}</span>
                </div>
              </div>
            </div>

            {/* Summary — a status card that expands to a per-day breakdown */}
            <div className="rounded-md bg-muted/50 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => setSummaryOpen((v) => !v)}
                aria-expanded={summaryOpen}
                className="flex w-full items-start gap-2 px-3 py-2 text-left leading-relaxed hover:bg-muted/80 rounded-md transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">Schedule: </span>
                  <span className={summaryOpen ? "" : "line-clamp-1"}>{summary}</span>
                </span>
                <span className="shrink-0 pt-0.5 text-muted-foreground" aria-hidden="true">
                  {summaryOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </span>
              </button>
              {summaryOpen && (
                <div className="border-t border-border/60 px-3 py-2">
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {dayBreakdown.map((d) => (
                      <li key={d.day} className="flex items-baseline justify-between gap-2">
                        <span>
                          <span className="font-medium text-foreground">{DAY_LABELS[d.day]}</span>
                          <span className="ml-1.5">{d.ranges.length > 0 ? d.ranges.join(", ") : "—"}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-medium text-foreground">{fmtHours(d.minutes)} h</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-border/60 pt-1.5 text-right">
                    Total marked: <span className="font-semibold text-foreground">{fmtHours(markedMinutes)} h</span> of {maxHours} h
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const queryClient = useQueryClient()

  // ── Data ──
  const { selectedCollegeId } = useCollege()

  // Fetch current user first so we can scope the faculty query correctly
  const { data: currentUser } = useQuery({
    queryKey: ["current-user-me"],
    queryFn: async () => {
      const res = await fetch("/api/users/me")
      const json = await res.json()
      return json.data ?? null
    },
  })
  const isAdminUser = currentUser?.role === "ADMIN"
  const userDeptId: string | undefined = currentUser?.departmentId ?? undefined

  // ADMIN sees only their own department's faculty; SUPER_ADMIN follows college filter
  const { data: faculty = [], isLoading: loadingFaculty } = useFacultyList(
    isAdminUser
      ? (userDeptId ? { departmentId: userDeptId } : undefined)
      : (selectedCollegeId ? { collegeId: selectedCollegeId } : undefined)
  )
  const createFaculty = useCreateFaculty()
  const updateFaculty = useUpdateFaculty()

  // ── Semesters ──
  const { data: semesters = [], isLoading: loadingSemesters } = useSemesters()

  // User-selected semester (dropdown). Empty = follow the active/most-recent one.
  const [selectedSemesterId, setSelectedSemesterId] = useState("")

  // Prefer the user's dropdown choice; else the explicitly-active semester;
  // else the most recent one so the page always works.
  const activeSemester = useMemo(() => {
    const sems = semesters as any[]
    if (selectedSemesterId) {
      const chosen = sems.find((s) => s.id === selectedSemesterId)
      if (chosen) return chosen
    }
    return sems.find((s) => s.isActive) ?? sems[0] ?? null
  }, [semesters, selectedSemesterId])

  const activeSemesterId = activeSemester?.id ?? ""

  const semesterLabel = useCallback((s: any) => {
    const type =
      s.type === "FIRST" ? "1st"
      : s.type === "SECOND" ? "2nd"
      : "Summer"
    return `${type} Semester — ${s.academicYear?.label ?? ""}`
  }, [])

  // ── UI state ──
  const [searchQuery, setSearchQuery] = useState("")

  // Add faculty dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", employeeId: "", maxUnitsPerWeek: 21 as number | string, maxHoursPerWeek: 30 as number | string })

  // Edit faculty dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)
  // Faculty pending deactivation — drives the confirm dialog below.
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null)
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", maxUnitsPerWeek: 21 as number | string, maxHoursPerWeek: 30 as number | string })

  // ── Faculty availability data ──
  const { data: allAvailability = [], isLoading: loadingAvailability } = useQuery({
    queryKey: ["faculty-availability-all", activeSemesterId],
    queryFn: async () => {
      if (!activeSemesterId) return []
      const res = await fetch(`/api/faculty/availability?semesterId=${activeSemesterId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch")
      return json.data ?? []
    },
    enabled: !!activeSemesterId,
  })

  // Build lookup: facultyId → Set of "DAY-HH:MM" keys
  const availabilityMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const slot of allAvailability) {
      const fid = (slot as any).facultyId
      if (!map.has(fid)) map.set(fid, new Set())
      const set = map.get(fid)!
      const startH = parseInt((slot as any).startTime.split(":")[0])
      const startM = parseInt((slot as any).startTime.split(":")[1])
      const endH = parseInt((slot as any).endTime.split(":")[0])
      const endM = parseInt((slot as any).endTime.split(":")[1])
      const availStart = startH * 60 + startM
      const availEnd = endH * 60 + endM

      for (const slotTime of SLOTS) {
        const [sh, sm] = slotTime.split(":").map(Number)
        const slotStart = sh * 60 + sm
        const slotEnd = slotStart + 30
        if (slotStart >= availStart && slotEnd <= availEnd) {
          set.add(`${(slot as any).day}-${slotTime}`)
        }
      }
    }
    return map
  }, [allAvailability])

  // ── Live workload: minutes of classes scheduled per faculty this semester ──
  // Polled + refetched on focus so a class added on Manage Schedules shows up
  // here without a reload; also refreshed whenever availability is saved.
  const { data: workload = {} } = useQuery<Record<string, { scheduledMinutes: number; entryCount: number; classCount: number }>>({
    queryKey: ["faculty-workload", activeSemesterId],
    queryFn: async () => {
      if (!activeSemesterId) return {}
      const res = await fetch(`/api/faculty/workload?semesterId=${activeSemesterId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch workload")
      return json.data ?? {}
    },
    enabled: !!activeSemesterId,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  })

  // Inline "Max hours / week" save from a faculty card's workload panel.
  const [savingMaxHoursFor, setSavingMaxHoursFor] = useState<string | null>(null)
  const handleSaveMaxHours = useCallback(
    async (facultyId: string, hours: number) => {
      setSavingMaxHoursFor(facultyId)
      try {
        await updateFaculty.mutateAsync({ id: facultyId, maxHoursPerWeek: hours })
      } catch {
        // toast surfaced by the mutation's onError
      } finally {
        setSavingMaxHoursFor(null)
      }
    },
    [updateFaculty],
  )

  // ── Save availability mutation ──
  const saveMutation = useMutation({
    mutationFn: async ({
      facultyId,
      slots,
    }: {
      facultyId: string
      slots: { day: string; startTime: string; endTime: string }[]
    }) => {
      const res = await fetch("/api/faculty/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facultyId, semesterId: activeSemesterId, slots }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to save")
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faculty-availability-all", activeSemesterId] })
      queryClient.invalidateQueries({ queryKey: ["faculty-workload", activeSemesterId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSave = useCallback(
    (facultyId: string, newSlots: { day: string; startTime: string; endTime: string }[]) => {
      saveMutation.mutate({ facultyId, slots: newSlots })
    },
    [saveMutation],
  )

  // ── Add faculty handler ──
  async function handleAddFaculty() {
    const { firstName, lastName, employeeId, maxUnitsPerWeek, maxHoursPerWeek } = addForm
    if (!firstName.trim()) return toast.error("First name is required")
    if (!lastName.trim()) return toast.error("Last name is required")

    const departmentId = currentUser?.department?.id ?? currentUser?.departmentId
    if (!departmentId) return toast.error("No department found for your account")

    try {
      await createFaculty.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(employeeId.trim() ? { employeeId: employeeId.trim() } : {}),
        departmentId,
        maxUnitsPerWeek: Number(maxUnitsPerWeek) || 21,
        maxHoursPerWeek: Number(maxHoursPerWeek) || 30,
      })
      setAddOpen(false)
      setAddForm({ firstName: "", lastName: "", employeeId: "", maxUnitsPerWeek: 21, maxHoursPerWeek: 30 })
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // ── Edit faculty handlers ──
  function openEdit(f: any) {
    setEditTarget(f)
    setEditForm({
      firstName: f.user?.firstName ?? "",
      lastName: f.user?.lastName ?? "",
      maxUnitsPerWeek: f.maxUnitsPerWeek ?? 21,
      maxHoursPerWeek: f.maxHoursPerWeek ?? 30,
    })
    setEditOpen(true)
  }

  async function handleUpdateFaculty() {
    if (!editTarget) return
    if (!editForm.firstName.trim()) return toast.error("First name is required")
    if (!editForm.lastName.trim()) return toast.error("Last name is required")

    try {
      await updateFaculty.mutateAsync({
        id: editTarget.id,
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        maxUnitsPerWeek: Number(editForm.maxUnitsPerWeek) || 21,
        maxHoursPerWeek: Number(editForm.maxHoursPerWeek) || 30,
      })
      setEditOpen(false)
      setEditTarget(null)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Search by name or department, then 10 cards per page.
  const filteredFaculty = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return faculty as any[]
    return (faculty as any[]).filter((f) => {
      const name = `${f.user?.firstName ?? ""} ${f.user?.lastName ?? ""}`.toLowerCase()
      const dept = (f.department?.name ?? "").toLowerCase()
      return name.includes(q) || dept.includes(q)
    })
  }, [faculty, searchQuery])
  const facultyPager = usePagination(filteredFaculty)

  // ── Deactivate handler ──
  // Confirmation runs through an in-app dialog (deactivateTarget) rather than
  // the browser's native confirm(), which renders as a raw "localhost:3000
  // says" popup and looks nothing like the rest of the app.
  async function handleDeactivate() {
    if (!deactivateTarget) return
    const f = deactivateTarget
    const name = `${f.user?.firstName ?? ""} ${f.user?.lastName ?? ""}`.trim()
    try {
      await updateFaculty.mutateAsync({ id: f.id, isActive: false })
      toast.success(`${name} has been deactivated`)
      setDeactivateTarget(null)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const isLoading = loadingFaculty || loadingAvailability || loadingSemesters

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
    {/* flex/gap instead of space-y: space-y's margin-bottom lands on the sticky
        bar itself (it's not the last child), which throws off the browser's
        sticky release point and shows as a gap/overlap once you scroll. */}
    <div className="flex flex-col gap-6">

      {/* Sticky action bar: Add Faculty + Search + Semester + College filter,
          all in one top row. Uses a negative `top` (not a negative margin) to
          cancel <main>'s p-4 lg:p-6 padding — sticky's clamp only ever honors
          the `top` inset once pinned, so a negative margin here would leave
          the bar's stuck position sitting margin px lower than its resting
          one, exposing a sliver of whatever scrolls underneath every time it
          pins. */}
      <div className="sticky -top-4 z-20 border-b border-border bg-background pt-4 pb-4 lg:-top-6 lg:pt-6 lg:pb-6">
        <PageHeader
          action={
            <>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Faculty
              </Button>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or department..."
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>
              <select
                value={activeSemesterId}
                onChange={(e) => setSelectedSemesterId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-48"
              >
                {(semesters as any[]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {semesterLabel(s)}{s.isActive ? " (Active)" : ""}
                  </option>
                ))}
              </select>
              {/* Only a Dept Chair can actually switch colleges. For a Program Chair
                  CollegeFilter renders a read-only badge naming the one college they are
                  already locked to — a control that cannot be operated and states
                  something the page never varies by, so it is not shown to them. */}
              {currentUser?.role === "SUPER_ADMIN" && (
                <CollegeFilter userRole={currentUser.role} />
              )}
            </>
          }
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-4 w-8 rounded"
            style={{ backgroundColor: "rgba(34,197,94,0.6)", border: "1px solid rgba(34,197,94,0.8)" }}
          />
          Available
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-8 rounded bg-muted border border-border" />
          Unavailable
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-4 w-8 rounded border border-red-300"
            style={{ background: "repeating-linear-gradient(45deg, rgba(239,68,68,0.45) 0 4px, rgba(239,68,68,0.12) 4px 8px)" }}
          />
          Over max hours
        </div>
      </div>

      {/* Only warn when no semesters exist at all */}
      {!loadingSemesters && (semesters as any[]).length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>No semesters found.</strong>{" "}
          Add an academic year and semester in Settings before managing faculty availability.
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading faculty availability...
        </div>
      )}

      {/* No faculty */}
      {activeSemesterId && !isLoading && faculty.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No faculty members found. Use the <strong>Add Faculty</strong> button to add one.
        </div>
      )}

      {/* Faculty cards — 10 per page */}
      {activeSemesterId && !isLoading && faculty.length > 0 && (
        filteredFaculty.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No faculty found matching &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
              {facultyPager.pageItems.map((f) => (
                <FacultyCard
                  key={f.id}
                  faculty={f}
                  availabilityMap={availabilityMap}
                  allAvailability={allAvailability}
                  scheduledMinutes={workload[f.id]?.scheduledMinutes ?? 0}
                  onSave={handleSave}
                  isSaving={saveMutation.isPending}
                  onSaveMaxHours={handleSaveMaxHours}
                  isSavingMaxHours={savingMaxHoursFor === f.id}
                  onEdit={openEdit}
                  onDeactivate={setDeactivateTarget}
                />
              ))}
            </div>
            <PaginationControls
              page={facultyPager.page}
              pageCount={facultyPager.pageCount}
              onPageChange={facultyPager.setPage}
              total={facultyPager.total}
              from={facultyPager.from}
              to={facultyPager.to}
              label="faculty"
            />
          </>
        )
      )}

      {/* ── Add Faculty Dialog ─────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Faculty Member</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Maria"
                  value={addForm.firstName}
                  onChange={(e) => setAddForm(f => ({ ...f, firstName: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleAddFaculty()}
                />
              </div>
              <div className="grid gap-2">
                <Label>Last Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Santos"
                  value={addForm.lastName}
                  onChange={(e) => setAddForm(f => ({ ...f, lastName: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleAddFaculty()}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>
                Employee ID
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional — auto-generated if blank)</span>
              </Label>
              <Input
                placeholder="e.g. FAC-2024-001"
                value={addForm.employeeId}
                onChange={(e) => setAddForm(f => ({ ...f, employeeId: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Max Units / Week</Label>
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={addForm.maxUnitsPerWeek}
                  onChange={(e) => setAddForm(f => ({ ...f, maxUnitsPerWeek: e.target.value === "" ? "" : Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Max Hours / Week</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={addForm.maxHoursPerWeek}
                  onChange={(e) => setAddForm(f => ({ ...f, maxHoursPerWeek: e.target.value === "" ? "" : Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddFaculty} disabled={createFaculty.isPending}>
              {createFaculty.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Faculty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Faculty Dialog ────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Faculty Record</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>First Name</Label>
                <Input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Last Name</Label>
                <Input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Max Units / Week</Label>
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={editForm.maxUnitsPerWeek}
                  onChange={(e) => setEditForm(f => ({ ...f, maxUnitsPerWeek: e.target.value === "" ? "" : Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Max Hours / Week</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={editForm.maxHoursPerWeek}
                  onChange={(e) => setEditForm(f => ({ ...f, maxHoursPerWeek: e.target.value === "" ? "" : Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateFaculty} disabled={updateFaculty.isPending}>
              {updateFaculty.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate faculty confirmation */}
      <Dialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate faculty?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">
              {deactivateTarget
                ? `${deactivateTarget.user?.firstName ?? ""} ${deactivateTarget.user?.lastName ?? ""}`.trim()
                : "This faculty member"}
            </strong>{" "}
            will no longer appear in faculty lists or be assignable to schedule entries. Their
            record and existing entries are kept — you can reactivate them later.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeactivate}
              disabled={updateFaculty.isPending}
            >
              {updateFaculty.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </RoleGuard>
  )
}
