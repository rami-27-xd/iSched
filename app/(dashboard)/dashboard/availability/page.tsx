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
import Link from "next/link"
import { Loader2, Plus, MoreHorizontal, Pencil, UserMinus, Search, CalendarDays } from "lucide-react"
import { toast } from "sonner"
import { useFacultyList, useCreateFaculty, useUpdateFaculty } from "@/hooks/use-data"
import { FACULTY_TYPES, FACULTY_TYPE_LABELS, MAX_UNITS_BY_TYPE, DEFAULT_HOURS_BY_TYPE, formatFacultyType, type FacultyType } from "@/lib/faculty-types"
import { useSchedules } from "@/hooks/use-schedules"
import { RoleGuard } from "@/components/shared/role-guard"
import { PageHeader } from "@/components/shared/page-header"
import { PaginationControls, usePagination } from "@/components/shared/pagination"
import { CardGridSkeleton } from "@/components/shared/loading-skeletons"

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

// ─── Faculty Card Component ───────────────────────────────────────────────────

function FacultyCard({
  faculty,
  availabilityMap,
  allAvailability,
  onSave,
  isSaving,
  onSaveMaxHours,
  isSavingMaxHours,
  onEdit,
  onDeactivate,
  readOnly = false,
}: {
  faculty: any
  availabilityMap: Map<string, Set<string>>
  allAvailability: any[]
  onSave: (facultyId: string, newSlots: { day: string; startTime: string; endTime: string }[]) => void
  isSaving: boolean
  onSaveMaxHours: (facultyId: string, hours: number) => void
  isSavingMaxHours: boolean
  onEdit?: (faculty: any) => void
  onDeactivate?: (faculty: any) => void
  /** Dean: the timeline, presets and max-hours box are displayed but cannot be changed. */
  readOnly?: boolean
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
      if (isSaving || readOnly) return // previous change still being stored — wait for the refresh
      const isCurrentlyOn = daySelected.has(idx)
      const mode = isCurrentlyOn ? "remove" : "add"
      // Nothing can be added once the cap is reached — refuse to start an add-drag.
      if (mode === "add" && atCap) { warnCap(1); return }
      dragRef.current = { dragging: true, startIdx: idx, endIdx: idx, mode }
      setDragPreview({ startIdx: idx, endIdx: idx, mode })
    },
    [daySelected, atCap, warnCap, isSaving, readOnly],
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
    if (isSaving) return
    const st = { start: block[0], end: block[1], side, cur: side === "start" ? block[0] : block[1] }
    resizeRef.current = st
    setResizePreview(st)
  }, [isSaving])

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
          <p className="text-xs mt-0.5 truncate" style={{ color: BRAND_GOLD }}>
            {department ? `${department} · ` : ""}
            <span title={`${formatFacultyType(faculty.employmentType)} — max ${faculty.maxUnitsPerWeek ?? 21} units / week`}>
              {formatFacultyType(faculty.employmentType)} · {faculty.maxUnitsPerWeek ?? 21}u max
            </span>
          </p>
        </div>
        {/* Max hours / week — caps the hours marked below and the classes the
            scheduler may assign. Saves on blur / Enter. */}
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <Label htmlFor={`max-hours-${faculty.id}`} className="hidden text-xs font-medium text-white/85 sm:block">
            Max hours / week
          </Label>
          <div className="relative">
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
              disabled={isSavingMaxHours || readOnly}
              aria-label="Max hours per week"
              title={`Max hours per week — ${fmtHours(markedMinutes)} h marked so far`}
              className="h-8 w-[4.5rem] border-white/30 bg-white/10 pr-6 text-center text-sm font-semibold tabular-nums text-white placeholder:text-white/50 focus-visible:ring-[#D4AF37]"
            />
            {isSavingMaxHours && (
              <Loader2 className="absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-white/80" />
            )}
          </div>
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
        <div className="grid gap-4">
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

            {/* Quick-action buttons — hidden for a read-only viewer */}
            {!readOnly && (
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
            )}

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
                  aria-busy={isSaving}
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

                  {/* Saving indicator — covers the timeline from the moment a
                      drag / preset / resize is released until the server has
                      stored it and the timeline has refreshed, so the change is
                      visibly "processing". */}
                  {isSaving && (
                    <div
                      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#1B4332] px-3 py-1 text-[11px] font-medium text-white shadow">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving availability…
                      </span>
                    </div>
                  )}
                </div>

                {/* Start/End labels */}
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 px-0.5">
                  <span>{formatTime12(SLOTS[0])}</span>
                  <span>{formatTime12(getEndTime(SLOTS[SLOTS.length - 1]))}</span>
                </div>
              </div>
            </div>

            {/* Schedule summary — one aligned row per day: day | time ranges | hours */}
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-foreground">Schedule</span>
                <span className="tabular-nums">
                  <span className="font-semibold text-foreground">{fmtHours(markedMinutes)} h</span> of {maxHours} h
                </span>
              </div>
              <div
                className="grid gap-x-3 gap-y-1"
                style={{ gridTemplateColumns: "2.25rem minmax(0, 1fr) 3rem" }}
                role="table"
                aria-label="Availability by day"
              >
                {dayBreakdown.map((d) => (
                  <div key={d.day} role="row" className="contents">
                    <span role="cell" className={`font-medium ${d.ranges.length > 0 ? "text-foreground" : "text-muted-foreground/70"}`}>
                      {DAY_SHORT[d.day]}
                    </span>
                    <span role="cell" className={`min-w-0 break-words tabular-nums ${d.ranges.length > 0 ? "" : "text-muted-foreground/60"}`}>
                      {d.ranges.length > 0 ? d.ranges.join(", ") : "—"}
                    </span>
                    <span role="cell" className={`text-right tabular-nums ${d.ranges.length > 0 ? "font-medium text-foreground" : "text-muted-foreground/60"}`}>
                      {d.ranges.length > 0 ? `${fmtHours(d.minutes)} h` : ""}
                    </span>
                  </div>
                ))}
              </div>
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
  // Fetch current user first so we know the role and department.
  const { data: currentUser } = useQuery({
    queryKey: ["current-user-me"],
    queryFn: async () => {
      const res = await fetch("/api/users/me")
      const json = await res.json()
      return json.data ?? null
    },
  })
  const isDean = currentUser?.role === "DEAN"
  const userDeptId: string | undefined = currentUser?.departmentId ?? undefined

  // Everyone sees their own department's faculty — /api/faculty scopes on the
  // server and ignores any department/college param, so no filter is offered.
  const { data: faculty = [], isLoading: loadingFaculty } = useFacultyList()
  const createFaculty = useCreateFaculty()
  const updateFaculty = useUpdateFaculty()

  // ── Term ──
  // Availability is recorded per Academic Year + Semester. The chair picks WHICH
  // term they are entering — the choices are the 1st and 2nd semesters that have
  // a non-archived schedule their faculty take part in (archived terms never
  // count; Summer is never offered here), defaulting to the active semester when
  // it has one, else the most recently created schedule's term. Generation and
  // manual entry then read strictly that term's rows — never another semester's.
  //
  // For a Program Chairperson that is their own department's schedule. For a
  // Department Chairperson (CAS) it is ANY department's schedule: CAS faculty
  // teach GEC/GEL in every college's timetable, and CAS rarely has a schedule
  // of its own — restricting to it hid every term (and every availability row
  // generation had already used) behind "No active schedule".
  const { data: deptSchedules = [], isLoading: loadingSchedules } = useSchedules(undefined, false)
  const isGeneralEducationChair = currentUser?.role === "SUPER_ADMIN"
  const terms = useMemo(() => {
    const byTerm = new Map<string, any>()
    for (const sc of deptSchedules as any[]) {
      if (!sc.semester || sc.isArchived || sc.status === "ARCHIVED") continue
      // 1st and 2nd semester only — availability is not kept for Summer.
      if (sc.semester.type !== "FIRST" && sc.semester.type !== "SECOND") continue
      if (!isGeneralEducationChair && userDeptId && (sc.departmentId ?? sc.department?.id) !== userDeptId) continue
      if (!byTerm.has(sc.semesterId)) byTerm.set(sc.semesterId, sc.semester)
    }
    return [...byTerm.entries()]
      .map(([id, sem]) => ({ id, sem }))
      .sort((a, b) => {
        const ay = (b.sem.academicYear?.startYear ?? 0) - (a.sem.academicYear?.startYear ?? 0)
        if (ay !== 0) return ay
        const order = { FIRST: 0, SECOND: 1, SUMMER: 2 } as Record<string, number>
        return (order[b.sem.type] ?? 0) - (order[a.sem.type] ?? 0)
      })
  }, [deptSchedules, userDeptId, isGeneralEducationChair])
  const [selectedTermId, setSelectedTermId] = useState("")
  const activeSemester = useMemo(() => {
    const chosen = terms.find((t) => t.id === selectedTermId)
    if (chosen) return chosen.sem
    return terms.find((t) => t.sem.isActive)?.sem ?? terms[0]?.sem ?? null
  }, [terms, selectedTermId])
  const activeSemesterId = activeSemester?.id ?? ""
  // True as soon as a term is selectable at all — every listed term has a
  // non-archived schedule in this department by construction.
  const hasActiveSchedule = !!activeSemesterId
  const loadingSemesters = loadingSchedules

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
  // Regular (21 units) / COSI (40 units): the unit cap follows the type; hours
  // start at the type's default and stay editable.
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", employeeId: "", employmentType: "REGULAR" as FacultyType, maxHoursPerWeek: 30 as number | string })

  // Edit faculty dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)
  // Faculty pending deactivation — drives the confirm dialog below.
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null)
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", employmentType: "REGULAR" as FacultyType, maxHoursPerWeek: 30 as number | string })

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

  // Inline "Max hours / week" save from a faculty card's header.
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
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Which faculty card is mid-save. Cleared only after the availability query
  // has refetched, so the card's spinner covers the whole round trip (save +
  // refresh) rather than blinking off while the old slots are still on screen.
  const [savingFacultyId, setSavingFacultyId] = useState<string | null>(null)
  const handleSave = useCallback(
    async (facultyId: string, newSlots: { day: string; startTime: string; endTime: string }[]) => {
      setSavingFacultyId(facultyId)
      try {
        await saveMutation.mutateAsync({ facultyId, slots: newSlots })
        await queryClient.invalidateQueries({ queryKey: ["faculty-availability-all", activeSemesterId] })
      } catch {
        // error toast is surfaced by the mutation's onError
      } finally {
        setSavingFacultyId((cur) => (cur === facultyId ? null : cur))
      }
    },
    [saveMutation, queryClient, activeSemesterId],
  )

  // ── Add faculty handler ──
  async function handleAddFaculty() {
    const { firstName, lastName, employeeId, employmentType, maxHoursPerWeek } = addForm
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
        employmentType,
        maxHoursPerWeek: Number(maxHoursPerWeek) || 30,
      })
      setAddOpen(false)
      setAddForm({ firstName: "", lastName: "", employeeId: "", employmentType: "REGULAR", maxHoursPerWeek: 30 })
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
      employmentType: (f.employmentType ?? "REGULAR") as FacultyType,
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
        employmentType: editForm.employmentType,
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

  const isLoading = loadingFaculty || loadingAvailability || loadingSemesters || loadingSchedules

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
    {/* flex/gap instead of space-y: space-y's margin-bottom lands on the sticky
        bar itself (it's not the last child), which throws off the browser's
        sticky release point and shows as a gap/overlap once you scroll. */}
    <div className="flex flex-col gap-6">

      {/* Sticky action bar: Add Faculty + Search in one top row. Uses a negative `top` (not a negative margin) to
          cancel <main>'s p-4 lg:p-6 padding — sticky's clamp only ever honors
          the `top` inset once pinned, so a negative margin here would leave
          the bar's stuck position sitting margin px lower than its resting
          one, exposing a sliver of whatever scrolls underneath every time it
          pins. */}
      <div className="sticky -top-4 z-20 border-b border-border bg-background pt-4 pb-4 lg:-top-6 lg:pt-6 lg:pb-6">
        <PageHeader
          action={
            <>
              {!isDean && (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Faculty
                </Button>
              )}
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
              {terms.length > 0 && (
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">Term</span>
                  <select
                    value={activeSemesterId}
                    onChange={(e) => setSelectedTermId(e.target.value)}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Term"
                  >
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {semesterLabel(t.sem)}{t.sem.isActive ? " (active)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
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
      </div>

      {/* No term to work on — availability is not computed or shown */}
      {!isLoading && !hasActiveSchedule && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <p className="font-semibold">
            {isGeneralEducationChair ? "No active schedule in any department yet." : "No active schedule for your department."}
          </p>
          <p className="mt-1">
            Faculty availability is recorded per term, against that term&apos;s schedule
            {isGeneralEducationChair ? " — for CAS faculty, any department's schedule for the term counts" : ""}. Create a schedule for the
            term in{" "}
            <Link href="/dashboard/schedules" className="font-medium underline underline-offset-2">Manage Schedules</Link>
            {" "}first — archived schedules do not count.
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <CardGridSkeleton count={4} label="Loading faculty availability" />}

      {/* No faculty */}
      {activeSemesterId && !isLoading && hasActiveSchedule && faculty.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No faculty members found. Use the <strong>Add Faculty</strong> button to add one.
        </div>
      )}

      {/* Faculty cards — 10 per page */}
      {activeSemesterId && !isLoading && hasActiveSchedule && faculty.length > 0 && (
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
                  onSave={handleSave}
                  isSaving={savingFacultyId === f.id}
                  onSaveMaxHours={handleSaveMaxHours}
                  isSavingMaxHours={savingMaxHoursFor === f.id}
                  onEdit={isDean ? undefined : openEdit}
                  onDeactivate={isDean ? undefined : setDeactivateTarget}
                  readOnly={isDean}
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
                <Label>Employment type</Label>
                <select
                  value={addForm.employmentType}
                  onChange={(e) => {
                    const t = e.target.value as FacultyType
                    // Switching type also resets the hours cap to that type's default.
                    setAddForm(f => ({ ...f, employmentType: t, maxHoursPerWeek: DEFAULT_HOURS_BY_TYPE[t] }))
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {FACULTY_TYPES.map((t) => (
                    <option key={t} value={t}>{FACULTY_TYPE_LABELS[t]} — max {MAX_UNITS_BY_TYPE[t]}u</option>
                  ))}
                </select>
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
                <Label>Employment type</Label>
                <select
                  value={editForm.employmentType}
                  onChange={(e) => {
                    const t = e.target.value as FacultyType
                    setEditForm(f => ({ ...f, employmentType: t, maxHoursPerWeek: DEFAULT_HOURS_BY_TYPE[t] }))
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {FACULTY_TYPES.map((t) => (
                    <option key={t} value={t}>{FACULTY_TYPE_LABELS[t]} — max {MAX_UNITS_BY_TYPE[t]}u</option>
                  ))}
                </select>
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
