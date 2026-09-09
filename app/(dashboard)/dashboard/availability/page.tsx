"use client"

import { useState, useMemo, useCallback, useRef } from "react"
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
import { Loader2, Plus, MoreHorizontal, Pencil, UserMinus, Search } from "lucide-react"
import { toast } from "sonner"
import { useFacultyList, useCreateFaculty, useUpdateFaculty, useSemesters } from "@/hooks/use-data"
import { useCollege } from "@/lib/college-context"
import { RoleGuard } from "@/components/shared/role-guard"
import { PageHeader } from "@/components/shared/page-header"
import { CollegeFilter } from "@/components/layout/college-filter"

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

// ─── Faculty Card Component ───────────────────────────────────────────────────

function FacultyCard({
  faculty,
  availabilityMap,
  allAvailability,
  onSave,
  isSaving,
  onEdit,
  onDeactivate,
}: {
  faculty: any
  availabilityMap: Map<string, Set<string>>
  allAvailability: any[]
  onSave: (facultyId: string, newSlots: { day: string; startTime: string; endTime: string }[]) => void
  isSaving: boolean
  onEdit?: (faculty: any) => void
  onDeactivate?: (faculty: any) => void
}) {
  const [activeDay, setActiveDay] = useState<string>("MONDAY")
  const dragRef = useRef<{ dragging: boolean; startIdx: number; endIdx: number; mode: "add" | "remove" } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ startIdx: number; endIdx: number; mode: "add" | "remove" } | null>(null)

  const facultySlots = availabilityMap.get(faculty.id) ?? new Set<string>()

  const firstName = faculty.user?.firstName ?? ""
  const lastName = faculty.user?.lastName ?? ""
  const department = faculty.department?.name ?? ""
  const fullName = `${lastName}${firstName ? `, ${firstName}` : ""}`

  // ─── Build summary across all days ────────────────────────────────────
  const summary = useMemo(() => {
    const parts: string[] = []
    for (const day of DAYS) {
      const daySlots = SLOTS.filter((s) => facultySlots.has(`${day}-${s}`))
      if (daySlots.length === 0) continue
      const ranges: string[] = []
      let rangeStart = daySlots[0]
      let prevIdx = SLOTS.indexOf(daySlots[0])
      for (let i = 1; i < daySlots.length; i++) {
        const curIdx = SLOTS.indexOf(daySlots[i])
        if (curIdx !== prevIdx + 1) {
          ranges.push(`${formatTime12(rangeStart)}-${formatTime12(getEndTime(SLOTS[prevIdx]))}`)
          rangeStart = daySlots[i]
        }
        prevIdx = curIdx
      }
      ranges.push(`${formatTime12(rangeStart)}-${formatTime12(getEndTime(SLOTS[prevIdx]))}`)
      parts.push(`${DAY_SHORT[day]}: ${ranges.join(", ")}`)
    }
    return parts.length > 0 ? parts.join(" | ") : "No availability set"
  }, [facultySlots])

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

  // ─── Commit a drag or quick-button change ─────────────────────────────
  const commitDaySlots = useCallback(
    (day: string, newSelectedIndices: Set<number>) => {
      const newSlots = buildNewSlots(day, newSelectedIndices)
      onSave(faculty.id, newSlots)
    },
    [buildNewSlots, faculty.id, onSave],
  )

  // ─── Drag handlers ────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (idx: number) => {
      const key = `${activeDay}-${SLOTS[idx]}`
      const isCurrentlyOn = facultySlots.has(key)
      const mode = isCurrentlyOn ? "remove" : "add"
      dragRef.current = { dragging: true, startIdx: idx, endIdx: idx, mode }
      setDragPreview({ startIdx: idx, endIdx: idx, mode })
    },
    [activeDay, facultySlots],
  )

  const handleMouseEnter = useCallback((idx: number) => {
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

    const lo = Math.min(startIdx, endIdx)
    const hi = Math.max(startIdx, endIdx)

    const currentSelected = new Set<number>()
    for (let i = 0; i < SLOTS.length; i++) {
      if (facultySlots.has(`${activeDay}-${SLOTS[i]}`)) {
        currentSelected.add(i)
      }
    }

    for (let i = lo; i <= hi; i++) {
      if (mode === "add") {
        currentSelected.add(i)
      } else {
        currentSelected.delete(i)
      }
    }

    commitDaySlots(activeDay, currentSelected)
  }, [activeDay, facultySlots, commitDaySlots])

  // ─── Quick buttons ────────────────────────────────────────────────────
  const applyPreset = useCallback(
    (startTime: string, endTime: string) => {
      const currentSelected = new Set<number>()
      for (let i = 0; i < SLOTS.length; i++) {
        if (facultySlots.has(`${activeDay}-${SLOTS[i]}`)) {
          currentSelected.add(i)
        }
      }

      const [sH, sM] = startTime.split(":").map(Number)
      const [eH, eM] = endTime.split(":").map(Number)
      const startMins = sH * 60 + sM
      const endMins = eH * 60 + eM

      for (let i = 0; i < SLOTS.length; i++) {
        const [h, m] = SLOTS[i].split(":").map(Number)
        const slotMins = h * 60 + m
        if (slotMins >= startMins && slotMins + 30 <= endMins) {
          currentSelected.add(i)
        }
      }

      commitDaySlots(activeDay, currentSelected)
    },
    [activeDay, facultySlots, commitDaySlots],
  )

  const clearDay = useCallback(() => {
    commitDaySlots(activeDay, new Set())
  }, [activeDay, commitDaySlots])

  const getDragRange = (): Set<number> => {
    if (!dragPreview) return new Set()
    const lo = Math.min(dragPreview.startIdx, dragPreview.endIdx)
    const hi = Math.max(dragPreview.startIdx, dragPreview.endIdx)
    const set = new Set<number>()
    for (let i = lo; i <= hi; i++) set.add(i)
    return set
  }

  const dragRange = getDragRange()

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

      <CardContent className="p-4 space-y-3">
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
            disabled={isSaving}
            className="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: BRAND_GREEN, color: BRAND_GREEN }}
          >
            Morning (7:30–12:00)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("12:00", "17:00")}
            disabled={isSaving}
            className="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: BRAND_GREEN, color: BRAND_GREEN }}
          >
            Afternoon (12:00–5:00)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("07:30", "21:00")}
            disabled={isSaving}
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
        <div className="relative select-none overflow-x-auto" style={{ userSelect: "none" }}>
          <div className="min-w-[600px]">
            {/* Hour labels — anchored to each hour's slot boundary so they sit
                directly over the gridlines drawn on the cells below (borderLeft =
                the cell's left edge). The previous version centered each label
                inside its 30-min cell, floating it half a slot to the right of
                the boundary it marks, so a block that looked like it began at
                8:00 was really being set to 7:45–8:15. */}
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

            {/* Timeline slots */}
            <div
              className="flex rounded-lg overflow-hidden border border-border"
              onMouseLeave={() => {
                if (dragRef.current?.dragging) handleMouseUp()
              }}
            >
              {SLOTS.map((slot, idx) => {
                const key = `${activeDay}-${slot}`
                const isAvailable = facultySlots.has(key)
                const isInDrag = dragRange.has(idx)

                let bgColor: string
                if (isInDrag) {
                  bgColor = dragPreview?.mode === "add" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.3)"
                } else if (isAvailable) {
                  bgColor = "rgba(34,197,94,0.6)"
                } else {
                  bgColor = "transparent"
                }

                const [, m] = slot.split(":").map(Number)
                const isHourBoundary = m === 0 && idx > 0

                return (
                  <div
                    key={idx}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleMouseDown(idx)
                    }}
                    onMouseEnter={() => handleMouseEnter(idx)}
                    onMouseUp={handleMouseUp}
                    className="relative cursor-pointer transition-all hover:brightness-90 hover:scale-y-110 active:scale-y-95"
                    style={{
                      width: `${100 / SLOTS.length}%`,
                      height: "44px",
                      backgroundColor: bgColor,
                      borderLeft: isHourBoundary ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(0,0,0,0.04)",
                    }}
                    title={`${DAY_LABELS[activeDay]} ${formatTime12(slot)} – ${formatTime12(getEndTime(slot))} ${isAvailable ? "(Available)" : "(Unavailable)"}`}
                  />
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

        {/* Summary */}
        <div className="rounded-md px-3 py-2 text-xs text-muted-foreground bg-muted/50 leading-relaxed">
          <span className="font-medium text-foreground">Schedule: </span>
          {summary}
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
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", employeeId: "", maxUnitsPerWeek: 21 as number | string })

  // Edit faculty dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)
  // Faculty pending deactivation — drives the confirm dialog below.
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null)
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", maxUnitsPerWeek: 21 as number | string })

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

  const handleSave = useCallback(
    (facultyId: string, newSlots: { day: string; startTime: string; endTime: string }[]) => {
      saveMutation.mutate({ facultyId, slots: newSlots })
    },
    [saveMutation],
  )

  // ── Add faculty handler ──
  async function handleAddFaculty() {
    const { firstName, lastName, employeeId, maxUnitsPerWeek } = addForm
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
      })
      setAddOpen(false)
      setAddForm({ firstName: "", lastName: "", employeeId: "", maxUnitsPerWeek: 21 })
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
      })
      setEditOpen(false)
      setEditTarget(null)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

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

      {/* Faculty cards */}
      {activeSemesterId && !isLoading && faculty.length > 0 && (() => {
        const q = searchQuery.toLowerCase().trim()
        const filtered = q
          ? (faculty as any[]).filter((f) => {
              const name = `${f.user?.firstName ?? ""} ${f.user?.lastName ?? ""}`.toLowerCase()
              const dept = (f.department?.name ?? "").toLowerCase()
              return name.includes(q) || dept.includes(q)
            })
          : (faculty as any[])
        return filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No faculty found matching &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
            {filtered.map((f) => (
              <FacultyCard
                key={f.id}
                faculty={f}
                availabilityMap={availabilityMap}
                allAvailability={allAvailability}
                onSave={handleSave}
                isSaving={saveMutation.isPending}
                onEdit={openEdit}
                onDeactivate={setDeactivateTarget}
              />
            ))}
          </div>
        )
      })()}

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
