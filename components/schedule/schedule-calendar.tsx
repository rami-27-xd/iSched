"use client"

import { useMemo, useRef, useState, useCallback, useEffect } from "react"
import FullCalendar from "@fullcalendar/react"
import timeGridPlugin from "@fullcalendar/timegrid"
import dayGridPlugin from "@fullcalendar/daygrid"
import type { EventInput, EventContentArg } from "@fullcalendar/core"
import { ChevronLeft, ChevronRight, BookOpen, FlaskConical, Pencil, Trash2, X, Clock, MapPin, Users, User, CalendarDays } from "lucide-react"

interface ScheduleEntry {
  id: string
  subjectCode: string
  subjectTitle: string
  facultyName: string
  roomCode: string
  sectionName: string
  day: string
  startTime: string
  endTime: string
  type: "LECTURE" | "LABORATORY"
  set?: string | null
  hasConflict?: boolean
}

interface ScheduleCalendarProps {
  entries: ScheduleEntry[]
  onEntryClick?: (entryId: string) => void
  onEditEntry?: (entryId: string) => void
  onDeleteEntry?: (entryId: string) => void
  semesterStartDate?: string
  semesterEndDate?: string
}

const DAY_MAP: Record<string, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
}

const TYPE_COLORS = {
  LECTURE: { bg: "#1B4332", border: "#D4AF37" },
  LABORATORY: { bg: "#2D6A4F", border: "#D4AF37" },
}

const TYPE_LABELS = {
  LECTURE: "Lecture",
  LABORATORY: "Laboratory",
}

const CONFLICT_COLOR = { bg: "#DC2626", border: "#FCA5A5" }

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`
}

function formatDateLabel(dateStr?: string): string {
  if (!dateStr) return ""
  // Accept both "2026-01-12" and full ISO strings ("2026-01-12T00:00:00.000Z").
  const datePart = dateStr.split("T")[0]
  const d = new Date(datePart + "T00:00:00")
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

function renderEventContent(eventInfo: EventContentArg) {
  const props = eventInfo.event.extendedProps as ScheduleEntry
  const isConflict = props.hasConflict
  const setLabel = props.type === "LABORATORY" && props.set ? ` (Set ${props.set})` : ""
  return (
    <div className={`isched-ev px-1.5 py-1 overflow-hidden leading-tight h-full flex flex-col justify-center gap-px ${isConflict ? "bg-red-600/90" : ""}`}>
      <div className="font-bold text-[11px] text-white truncate">{props.subjectCode}{setLabel}</div>
      <div className="isched-ev-sub text-[10px] text-white/90 truncate">{props.facultyName}</div>
      <div className="isched-ev-sub text-[9px] text-white/75 truncate">{props.roomCode} &middot; {props.sectionName}</div>
    </div>
  )
}

export function ScheduleCalendar({ entries, onEntryClick, onEditEntry, onDeleteEntry, semesterStartDate, semesterEndDate }: ScheduleCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ entry: ScheduleEntry; x: number; y: number } | null>(null)

  const events: EventInput[] = useMemo(
    () =>
      entries.map((entry) => {
        const colors = entry.hasConflict ? CONFLICT_COLOR : TYPE_COLORS[entry.type]
        return {
          id: entry.id,
          title: entry.subjectCode,
          daysOfWeek: [DAY_MAP[entry.day]],
          startTime: entry.startTime,
          endTime: entry.endTime,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          textColor: "#FFFFFF",
          extendedProps: entry,
        }
      }),
    [entries]
  )

  const handlePrev = () => calendarRef.current?.getApi().prev()
  const handleNext = () => calendarRef.current?.getApi().next()
  const handleToday = () => calendarRef.current?.getApi().today()

  // Close tooltip on outside click
  useEffect(() => {
    if (!tooltip) return
    function handleClick(e: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltip(null)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [tooltip])

  // Tooltip handler via FullCalendar eventMouseEnter/eventMouseLeave
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventMouseEnter = useCallback((info: any) => {
    const entry = info.event.extendedProps as ScheduleEntry
    const rect = info.el.getBoundingClientRect()
    setTooltip({
      entry,
      x: rect.right + 8,
      y: rect.top,
    })
  }, [])

  const handleEventMouseLeave = useCallback(() => {
    // Small delay so user can move to tooltip if needed
    setTimeout(() => {
      setTooltip((prev) => prev)
    }, 100)
  }, [])

  // Snap validRange.start back to the Monday of the semester's first week so
  // Mon/Tue are never clipped when the semester starts mid-week (e.g. Wed Jun 3).
  const calendarValidStart = useMemo(() => {
    if (!semesterStartDate) return undefined
    const d = new Date(semesterStartDate.split("T")[0] + "T00:00:00")
    const dow = d.getDay() // 0=Sun … 6=Sat
    const daysBack = dow === 0 ? 6 : dow - 1 // shift to Monday
    d.setDate(d.getDate() - daysBack)
    // Format from LOCAL fields — toISOString() converts to UTC, which in a
    // timezone ahead of UTC (e.g. UTC+8) rolls the date back a day and made
    // validRange.start land on Sunday, clipping Monday out of the week view.
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const da = String(d.getDate()).padStart(2, "0")
    return `${y}-${mo}-${da}`
  }, [semesterStartDate])

  // Count entries by type for legend
  const lectureCount = entries.filter(e => e.type === "LECTURE").length
  const labCount = entries.filter(e => e.type === "LABORATORY").length
  const conflictCount = entries.filter(e => e.hasConflict).length

  const typeBadgeColor = (type: string) => {
    if (type === "LECTURE") return "bg-[#1B4332]"
    return "bg-[#2D6A4F]"
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-md overflow-visible relative">
      {/* Semester date range bar */}
      {(semesterStartDate || semesterEndDate) && (
        <div className="bg-muted/40 border-b border-border px-5 py-2 flex items-center justify-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-[#1B4332]" />
          <span className="text-xs font-medium text-[#1B4332]">
            {formatDateLabel(semesterStartDate)}
            {semesterStartDate && semesterEndDate && " — "}
            {formatDateLabel(semesterEndDate)}
          </span>
        </div>
      )}

      {/* Custom branded header */}
      <div className="bg-[#1B4332] px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={handleToday}
            className="ml-1 px-3 py-1 rounded-lg bg-[#D4AF37] hover:bg-[#C4A030] text-[#1B4332] text-xs font-semibold transition-colors"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-white/80">
            {lectureCount > 0 && (
              <span className="flex items-center gap-1">
                <BookOpen className="h-3 w-3 text-white/70" />
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#1B4332] border border-white/30" />
                Lecture
              </span>
            )}
            {labCount > 0 && (
              <span className="flex items-center gap-1">
                <FlaskConical className="h-3 w-3 text-white/70" />
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#2D6A4F] border border-white/30" />
                Lab
              </span>
            )}
{conflictCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 border border-white/30" />
                Conflict
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Calendar body — horizontally scrollable on mobile */}
      <div className="isched-calendar-wrap overflow-x-auto">
        <style>{`
          /* ── Hide default FullCalendar toolbar (we use custom header) ── */
          .isched-calendar-wrap .fc-toolbar.fc-header-toolbar {
            display: none !important;
          }

          /* ── Grid theming ── */
          .isched-calendar-wrap .fc-theme-standard td,
          .isched-calendar-wrap .fc-theme-standard th {
            border-color: #f0f0f0;
          }
          .isched-calendar-wrap .fc-scrollgrid {
            border: none !important;
          }
          .isched-calendar-wrap .fc-scrollgrid-section > * {
            border-color: #f0f0f0;
          }

          /* ── Day column headers ── */
          .isched-calendar-wrap .fc-col-header-cell {
            background: #f8faf9;
            padding: 10px 0;
            border-bottom: 2px solid #1B4332;
          }
          .isched-calendar-wrap .fc-col-header-cell-cushion {
            font-size: 0.8rem;
            font-weight: 600;
            color: #1B4332;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            text-decoration: none !important;
          }

          /* ── Time slot labels ── */
          .isched-calendar-wrap .fc-timegrid-slot-label-cushion {
            font-size: 0.7rem;
            font-weight: 500;
            color: #6b7280;
            padding-right: 12px;
          }
          .isched-calendar-wrap .fc-timegrid-slot {
            height: 2.8em;
          }
          .isched-calendar-wrap .fc-timegrid-slot-lane {
            background: transparent;
          }
          /* Alternate row stripes for readability */
          .isched-calendar-wrap .fc-timegrid-slot:nth-child(4n+1) .fc-timegrid-slot-lane,
          .isched-calendar-wrap .fc-timegrid-slot:nth-child(4n+2) .fc-timegrid-slot-lane {
            background: #fafbfa;
          }

          /* ── Today column highlight ── */
          .isched-calendar-wrap .fc-day-today {
            background: rgba(27, 67, 50, 0.03) !important;
          }
          .isched-calendar-wrap .fc-col-header-cell.fc-day-today {
            background: rgba(27, 67, 50, 0.08) !important;
          }
          .isched-calendar-wrap .fc-col-header-cell.fc-day-today .fc-col-header-cell-cushion {
            color: #D4AF37;
          }

          /* ── Current time indicator ── */
          .isched-calendar-wrap .fc-timegrid-now-indicator-line {
            border-color: #D4AF37 !important;
            border-width: 2px;
          }
          .isched-calendar-wrap .fc-timegrid-now-indicator-arrow {
            border-color: #D4AF37 !important;
            border-top-color: transparent !important;
            border-bottom-color: transparent !important;
          }

          /* ── Event blocks — time-spanning with gold accent ── */
          .isched-calendar-wrap .fc-timegrid-event {
            border-radius: 5px !important;
            border-left-width: 3px !important;
            box-shadow: 0 1px 2px rgba(0,0,0,0.18);
            transition: box-shadow 0.15s ease, transform 0.15s ease;
            overflow: hidden;
            cursor: pointer;
          }
          .isched-calendar-wrap .fc-timegrid-event:hover {
            box-shadow: 0 4px 8px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1);
            transform: translateY(-1px);
            z-index: 10 !important;
          }
          .isched-calendar-wrap .fc-timegrid-event .fc-event-main {
            padding: 0;
          }
          /* Drop the 2nd/3rd text lines only when the block is too short for them
             (≈ a 30-min class) so single-line events stay readable. */
          .isched-calendar-wrap .fc-timegrid-event.fc-timegrid-event-short .isched-ev-sub {
            display: none;
          }

          /* ── Overlapping events side-by-side ── */
          .isched-calendar-wrap .fc-timegrid-event-harness {
            margin-right: 1px;
          }

          /* ── "+N more" chip (was an unstyled grey bar) ── */
          .isched-calendar-wrap .fc-timegrid-more-link {
            background: #1B4332;
            color: #fff;
            font-size: 0.65rem;
            font-weight: 700;
            line-height: 1;
            padding: 2px 4px;
            border-radius: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          }
          .isched-calendar-wrap .fc-timegrid-more-link:hover {
            background: #2D6A4F;
          }
          .isched-calendar-wrap .fc-popover {
            border: 1px solid #1B4332 !important;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          }
          .isched-calendar-wrap .fc-popover-header {
            background: #1B4332;
            color: #fff;
          }

          /* ── Remove outer borders for clean look ── */
          .isched-calendar-wrap .fc-scrollgrid-section-header > th {
            border-right: none;
          }
          .isched-calendar-wrap .fc-timegrid-divider {
            display: none;
          }

          /* ── Keep day columns wide enough to read; scroll horizontally when
                the container is narrower than this. ── */
          .isched-calendar-wrap .fc {
            min-width: 1040px;
          }
        `}</style>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "title",
            center: "",
            right: "",
          }}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00:00"
          slotLabelFormat={{
            hour: "numeric",
            minute: "2-digit",
            meridiem: "short",
          }}
          allDaySlot={false}
          weekends={true}
          hiddenDays={[0]}
          slotEventOverlap={false}
          eventMaxStack={3}
          moreLinkText={(n) => `+${n}`}
          nowIndicator={true}
          dayHeaderFormat={{ weekday: "long" }}
          {...(semesterStartDate ? { initialDate: semesterStartDate.split("T")[0] } : {})}
          {...(calendarValidStart && semesterEndDate ? { validRange: { start: calendarValidStart, end: semesterEndDate.split("T")[0] } } : {})}
          events={events}
          editable={false}
          selectable={true}
          eventContent={renderEventContent}
          eventClick={(info) => {
            const entry = info.event.extendedProps as ScheduleEntry
            const rect = info.el.getBoundingClientRect()
            setTooltip({ entry, x: rect.right + 8, y: rect.top })
          }}
          eventMouseEnter={handleEventMouseEnter}
          eventMouseLeave={handleEventMouseLeave}
          height="auto"
          expandRows
        />
      </div>

      {/* Footer summary */}
      <div className="bg-muted/40 border-t border-border px-5 py-2.5 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-[#1B4332]">{entries.length}</span> total entries
          {conflictCount > 0 && (
            <span className="ml-2 text-red-600 font-medium">&middot; {conflictCount} conflict{conflictCount > 1 ? "s" : ""}</span>
          )}
        </p>
        {/* Mobile legend */}
        <div className="flex sm:hidden items-center gap-2 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#1B4332]" /> Lec
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#2D6A4F]" /> Lab
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#40916C]" /> Hyb
          </span>
        </div>
      </div>

      {/* ── Hover/Click Tooltip — full entry details ── */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            left: Math.min(tooltip.x, typeof window !== "undefined" ? window.innerWidth - 320 : tooltip.x),
            top: Math.max(8, Math.min(tooltip.y, typeof window !== "undefined" ? window.innerHeight - 300 : tooltip.y)),
          }}
          onMouseLeave={() => setTooltip(null)}
        >
          <div className="w-72 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            {/* Tooltip header */}
            <div className={`px-4 py-3 ${tooltip.entry.hasConflict ? "bg-red-600" : typeBadgeColor(tooltip.entry.type)} text-white`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">
                    {tooltip.entry.subjectCode}
                    {tooltip.entry.type === "LABORATORY" && tooltip.entry.set ? ` (Set ${tooltip.entry.set})` : ""}
                  </p>
                  <p className="text-[11px] text-white/85 leading-snug">{tooltip.entry.subjectTitle}</p>
                </div>
                <button
                  onClick={() => setTooltip(null)}
                  className="shrink-0 p-0.5 rounded hover:bg-white/20 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-white/20 text-[9px] font-semibold uppercase tracking-wider">
                {TYPE_LABELS[tooltip.entry.type]}
                {tooltip.entry.type === "LABORATORY" && tooltip.entry.set ? ` — Set ${tooltip.entry.set}` : ""}
              </span>
            </div>

            {/* Tooltip body */}
            <div className="px-4 py-3 space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm">
                <User className="h-3.5 w-3.5 text-[#1B4332] shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Faculty</p>
                  <p className="text-xs font-medium">{tooltip.entry.facultyName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <MapPin className="h-3.5 w-3.5 text-[#1B4332] shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Room</p>
                  <p className="text-xs font-medium">{tooltip.entry.roomCode || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Users className="h-3.5 w-3.5 text-[#1B4332] shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Section</p>
                  <p className="text-xs font-medium">{tooltip.entry.sectionName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Clock className="h-3.5 w-3.5 text-[#1B4332] shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Schedule</p>
                  <p className="text-xs font-medium">
                    {tooltip.entry.day.charAt(0) + tooltip.entry.day.slice(1).toLowerCase()},{" "}
                    {formatTime12h(tooltip.entry.startTime)} – {formatTime12h(tooltip.entry.endTime)}
                  </p>
                </div>
              </div>
            </div>

            {/* Tooltip footer with Edit/Delete buttons */}
            {(onEditEntry || onDeleteEntry) && (
              <div className="px-4 py-2.5 border-t border-border bg-muted/40 flex gap-2">
                {onEditEntry && (
                  <button
                    onClick={() => {
                      onEditEntry(tooltip.entry.id)
                      setTooltip(null)
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-medium transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit Entry
                  </button>
                )}
                {onDeleteEntry && (
                  <button
                    onClick={() => {
                      onDeleteEntry(tooltip.entry.id)
                      setTooltip(null)
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 text-xs font-medium transition-colors"
                    title="Delete entry"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
