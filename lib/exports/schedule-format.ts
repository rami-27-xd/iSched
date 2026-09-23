/**
 * Print-ready HTML builders for the two official schedule exports (spec Section 6),
 * both derived from the same generated/published schedule data:
 *
 *   1. Schedule of Subjects (ISO form)  — grouped per Course/Year/Section.
 *   2. Teaching Load (letter)           — grouped per Faculty member.
 *
 * These functions are framework-agnostic (pure string builders) so they can be
 * shared by the Dept/Program Chair export dialog (Manage Schedules) and the
 * faculty-facing "My Schedule" page. The caller supplies a flat list of entries,
 * the header/semester context, the signatory names, and a logo data URL.
 */

export interface ExportEntry {
  subjectCode: string
  subjectTitle: string
  units: number
  /** Contact (meeting) hours per week — Subject.hoursPerWeek. */
  contactHours: number
  type: "LECTURE" | "LABORATORY"
  facultyId: string
  facultyName: string
  roomCode: string
  sectionId: string
  sectionName: string
  programName: string
  programAbbr: string
  yearLevel: number
  day: string
  startTime: string
  endTime: string
  /** null = lecture; "A" / "B" = laboratory split group. */
  set: string | null
  /** Merged NSTP class — rows of several sections that meet as ONE class. */
  mergeGroupId?: string | null
}

export interface ExportHeader {
  /** e.g. "1st Semester" */
  semesterLabel: string
  /** Academic year label, e.g. "2026-2027" */
  academicYear: string
  /** Owning college name, e.g. "College of Industrial Technology" */
  collegeName: string
  collegeAbbr: string
  /** Human date the document is prepared, e.g. "August 28, 2026" */
  date: string
  /** Semester start date, e.g. "July 20, 2026" (for the teaching-load letter). */
  classesStartDate: string
}

export interface Signatories {
  /** Recipient office / addressee for the ISO form (the "To" field). */
  toOffice: string
  /** Program Chairperson — "Prepared by" on the ISO form. */
  preparedByName: string
  preparedByPosition: string
  /** Dean — "Approved by" on the ISO form / "Very truly yours" on the letter. */
  deanName: string
  deanPosition: string
  /** VP for Academic Affairs — "Noted by" on the teaching-load letter. */
  notedByName: string
  notedByPosition: string
}

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
const DAY_ABBR: Record<string, string> = {
  MONDAY: "M",
  TUESDAY: "Tu",
  WEDNESDAY: "W",
  THURSDAY: "Th",
  FRIDAY: "F",
  SATURDAY: "Sat",
}

export function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export interface SessionLine {
  set: string | null
  days: string
  time: string
  room: string
}

/**
 * Collapse a subject's raw entries into display lines: identical
 * (set, time, room) sessions on different days are merged into one line
 * (e.g. Mon+Wed+Fri 8:00-9:00 → "MWF"). Labs keep their A/B split.
 */
function clusterSessions(entries: ExportEntry[]): SessionLine[] {
  const groups = new Map<string, { set: string | null; startTime: string; endTime: string; room: string; days: Set<string> }>()
  for (const e of entries) {
    const key = `${e.set ?? ""}|${e.startTime}|${e.endTime}|${e.roomCode}`
    if (!groups.has(key)) {
      groups.set(key, { set: e.set, startTime: e.startTime, endTime: e.endTime, room: e.roomCode, days: new Set() })
    }
    groups.get(key)!.days.add(e.day)
  }
  return [...groups.values()]
    .map((g) => {
      const orderedDays = DAY_ORDER.filter((d) => g.days.has(d))
      return {
        set: g.set,
        days: orderedDays.map((d) => DAY_ABBR[d] ?? d).join(""),
        time: `${formatTime12h(g.startTime)} - ${formatTime12h(g.endTime)}`,
        room: g.room,
        _sortDay: DAY_ORDER.indexOf(orderedDays[0] ?? "MONDAY"),
        _sortSet: g.set ?? "",
      }
    })
    .sort((a, b) => (a._sortSet < b._sortSet ? -1 : a._sortSet > b._sortSet ? 1 : a._sortDay - b._sortDay))
    .map(({ set, days, time, room }) => ({ set, days, time, room }))
}

const PRINT_BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; padding: 0; }
  .page { padding: 28px 34px 56px; position: relative; min-height: 100vh; }
  .page + .page { page-break-before: always; }
  .letterhead { text-align: center; margin-bottom: 10px; }
  .letterhead img { height: 74px; width: 74px; object-fit: contain; }
  .lh-line1 { font-size: 12px; margin-top: 4px; }
  .lh-line2 { font-size: 15px; font-weight: bold; letter-spacing: .3px; }
  .lh-line3 { font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  .grid th, .grid td { border: 1px solid #333; padding: 4px 6px; font-size: 11px; vertical-align: middle; }
  .grid th { background: #f0f0f0; text-align: center; font-weight: bold; }
  .stack { display: flex; flex-direction: column; gap: 2px; }
  .muted { color: #555; }
  .footer-iso { position: absolute; bottom: 18px; left: 34px; right: 34px; display: flex; justify-content: flex-end; font-size: 10px; color: #333; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 34px; gap: 24px; }
  .sig { flex: 1; font-size: 12px; }
  .sig .name { font-weight: bold; text-transform: uppercase; border-top: 1px solid #111; padding-top: 2px; margin-top: 22px; }
  .sig .pos { font-style: italic; }
  @media print { .page { min-height: auto; } @page { size: A4; margin: 0; } }
`

// ─────────────────────────────────────────────────────────────────────────────
// 6.1  Schedule of Subjects (ISO form) — one page per section
// ─────────────────────────────────────────────────────────────────────────────

interface SectionGroup {
  sectionId: string
  sectionName: string
  programName: string
  programAbbr: string
  yearLevel: number
  entries: ExportEntry[]
}

function groupBySection(entries: ExportEntry[]): SectionGroup[] {
  const map = new Map<string, SectionGroup>()
  for (const e of entries) {
    if (!map.has(e.sectionId)) {
      map.set(e.sectionId, {
        sectionId: e.sectionId,
        sectionName: e.sectionName,
        programName: e.programName,
        programAbbr: e.programAbbr,
        yearLevel: e.yearLevel,
        entries: [],
      })
    }
    map.get(e.sectionId)!.entries.push(e)
  }
  return [...map.values()].sort(
    (a, b) =>
      a.programAbbr.localeCompare(b.programAbbr) ||
      a.yearLevel - b.yearLevel ||
      a.sectionName.localeCompare(b.sectionName)
  )
}

const YEAR_LABELS = ["First", "Second", "Third", "Fourth", "Fifth"]

function isoSectionPage(group: SectionGroup, pageNo: number, pageCount: number, header: ExportHeader, sig: Signatories, logo: string): string {
  // One table row per subject (identified by code) within the section.
  const bySubject = new Map<string, ExportEntry[]>()
  for (const e of group.entries) {
    if (!bySubject.has(e.subjectCode)) bySubject.set(e.subjectCode, [])
    bySubject.get(e.subjectCode)!.push(e)
  }

  let totalUnits = 0
  const rows = [...bySubject.values()]
    .sort((a, b) => a[0].subjectCode.localeCompare(b[0].subjectCode))
    .map((subEntries) => {
      const first = subEntries[0]
      totalUnits += first.units
      const lines = clusterSessions(subEntries)
      const facultyNames = [...new Set(subEntries.map((e) => e.facultyName).filter(Boolean))]
      const dayCell = lines.map((l) => escapeHtml(l.days + (l.set ? ` (Set ${l.set})` : ""))).join("<br/>")
      const timeCell = lines.map((l) => escapeHtml(l.time)).join("<br/>")
      const roomCell = lines.map((l) => escapeHtml(l.room)).join("<br/>")
      return `
        <tr>
          <td style="font-family:monospace;text-align:center">${escapeHtml(first.subjectCode)}</td>
          <td>${escapeHtml(first.subjectTitle)}</td>
          <td style="text-align:center">${first.units}</td>
          <td style="text-align:center">${dayCell}</td>
          <td style="text-align:center">${timeCell}</td>
          <td style="text-align:center">${roomCell}</td>
          <td>${escapeHtml(facultyNames.join(", "))}</td>
        </tr>`
    })
    .join("")

  const yearLabel = YEAR_LABELS[group.yearLevel - 1] ?? `Year ${group.yearLevel}`
  const courseYrSection = `${group.programName} / ${yearLabel} Year`

  return `
    <div class="page">
      <div class="letterhead">
        ${logo ? `<img src="${logo}" alt="SLSU" />` : ""}
        <div class="lh-line2" style="margin-top:8px">SCHEDULE OF SUBJECTS</div>
      </div>

      <table style="margin:10px 0 6px;font-size:12px">
        <tr>
          <td style="width:52%"><b>To</b> : ${escapeHtml(sig.toOffice)}</td>
          <td><b>Date</b> : ${escapeHtml(header.date)}</td>
        </tr>
        <tr>
          <td><b>From</b> : ${escapeHtml(header.collegeName)}</td>
          <td><b>Schedule for Sem/AY</b> : ${escapeHtml(header.semesterLabel)}, AY ${escapeHtml(header.academicYear)}</td>
        </tr>
        <tr>
          <td colspan="2"><b>Course/Yr/Section</b> : ${escapeHtml(courseYrSection)} — ${escapeHtml(group.sectionName)}</td>
        </tr>
      </table>

      <table class="grid">
        <thead>
          <tr>
            <th style="width:9%">Code</th>
            <th style="width:30%">Subject Description</th>
            <th style="width:7%">Units</th>
            <th style="width:12%">Day</th>
            <th style="width:15%">Time</th>
            <th style="width:11%">Room</th>
            <th style="width:16%">Faculty</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <td></td>
            <td style="text-align:right"><b>Total Units</b></td>
            <td style="text-align:center"><b>${totalUnits}</b></td>
            <td colspan="4"></td>
          </tr>
        </tbody>
      </table>

      <div class="sig-row">
        <div class="sig">
          Prepared by:
          <div class="name">${escapeHtml(sig.preparedByName)}</div>
          <div class="pos">${escapeHtml(sig.preparedByPosition)}</div>
        </div>
        <div class="sig">
          Approved by:
          <div class="name">${escapeHtml(sig.deanName)}</div>
          <div class="pos">${escapeHtml(sig.deanPosition)}</div>
        </div>
      </div>

      <div class="footer-iso">
        <span>Page ${pageNo} of ${pageCount}</span>
      </div>
    </div>`
}

export function buildScheduleOfSubjectsHtml(opts: {
  entries: ExportEntry[]
  header: ExportHeader
  signatories: Signatories
  logoDataUrl: string
}): string {
  const groups = groupBySection(opts.entries)
  const pageCount = Math.max(groups.length, 1)
  const pages = groups
    .map((g, i) => isoSectionPage(g, i + 1, pageCount, opts.header, opts.signatories, opts.logoDataUrl))
    .join("")
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>Schedule of Subjects — ${escapeHtml(opts.header.semesterLabel)} ${escapeHtml(opts.header.academicYear)}</title>
    <style>${PRINT_BASE_CSS}</style></head>
    <body>${pages || '<div class="page"><p>No entries to export.</p></div>'}</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.2  Teaching Load (letter) — one page per faculty
// ─────────────────────────────────────────────────────────────────────────────

interface FacultyGroup {
  facultyId: string
  facultyName: string
  entries: ExportEntry[]
}

function groupByFaculty(entries: ExportEntry[]): FacultyGroup[] {
  const map = new Map<string, FacultyGroup>()
  for (const e of entries) {
    const key = e.facultyId || e.facultyName
    if (!map.has(key)) map.set(key, { facultyId: e.facultyId, facultyName: e.facultyName, entries: [] })
    map.get(key)!.entries.push(e)
  }
  return [...map.values()].sort((a, b) => a.facultyName.localeCompare(b.facultyName))
}

/** Grouped teaching-load rows + summary — shared by the printed letter and the
 * on-screen "My Schedule" table so the two never diverge. */
export interface TeachingLoadRow {
  code: string
  title: string
  units: number
  contactHours: number
  courseYear: string
  lines: SessionLine[]
}
export interface TeachingLoadSummary {
  subjects: number
  preparations: number
  units: number
  hours: number
}

/** Weekly contact hours of a single scheduled session (end − start), in hours. */
function sessionHours(e: ExportEntry): number {
  const [sh, sm] = e.startTime.split(":").map(Number)
  const [eh, em] = e.endTime.split(":").map(Number)
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

export function computeTeachingLoad(entries: ExportEntry[]): {
  rows: TeachingLoadRow[]
  summary: TeachingLoadSummary
} {
  // One row per (subject × SECTION). Grouping by program+year (the old key) merged two
  // sections of the same year into a single row, undercounting both units and hours.
  // A merged NSTP class (several sections in one room at one time) is ONE row
  // and ONE set of contact hours, however many sections sit in it.
  const rowMap = new Map<string, ExportEntry[]>()
  for (const e of entries) {
    const key = e.mergeGroupId ? `${e.subjectCode}|merged:${e.mergeGroupId}` : `${e.subjectCode}|${e.sectionId}`
    if (!rowMap.has(key)) rowMap.set(key, [])
    rowMap.get(key)!.push(e)
  }
  let units = 0
  let hours = 0
  const preparations = new Set<string>()
  const rows = [...rowMap.values()]
    .sort((a, b) => a[0].subjectCode.localeCompare(b[0].subjectCode) || a[0].sectionName.localeCompare(b[0].sectionName))
    .map((allSubEntries) => {
      const first = allSubEntries[0]
      preparations.add(first.subjectCode)
      // Merged sections: one session row per (day, time, set) — the faculty
      // teaches it once, so its hours and day/time lines are listed once.
      const mergedSections = first.mergeGroupId
        ? [...new Set(allSubEntries.map((e) => e.sectionName))].sort()
        : []
      const subEntries = first.mergeGroupId
        ? [...new Map(allSubEntries.map((e) => [`${e.day}|${e.startTime}|${e.endTime}|${e.set ?? ""}`, e])).values()]
        : allSubEntries
      // Contact hours = the ACTUAL total scheduled time for this subject-section across
      // every session (all days, and both lab sets A+B) — accurate and consistent with
      // the grand total, rather than a single nominal Subject.hoursPerWeek value.
      const rowHours = subEntries.reduce((sum, e) => sum + sessionHours(e), 0)
      units += first.units
      hours += rowHours
      const yearLabel = YEAR_LABELS[first.yearLevel - 1] ?? `Year ${first.yearLevel}`
      return {
        code: first.subjectCode,
        title: first.subjectTitle,
        units: first.units,
        contactHours: Math.round(rowHours * 10) / 10,
        courseYear: mergedSections.length > 1
          ? `${first.programAbbr} ${yearLabel} Yr (${mergedSections.join(" + ")})`
          : `${first.programAbbr} ${yearLabel} Yr`,
        lines: clusterSessions(subEntries),
      }
    })
  return {
    rows,
    summary: { subjects: rowMap.size, preparations: preparations.size, units, hours: Math.round(hours * 10) / 10 },
  }
}

function teachingLoadPage(group: FacultyGroup, header: ExportHeader, sig: Signatories, logo: string): string {
  const { rows: tlRows, summary } = computeTeachingLoad(group.entries)
  const rows = tlRows
    .map((r) => {
      const dayCell = r.lines.map((l) => escapeHtml(l.days + (l.set ? ` (Set ${l.set})` : ""))).join("<br/>")
      const timeCell = r.lines.map((l) => escapeHtml(l.time)).join("<br/>")
      const roomCell = r.lines.map((l) => escapeHtml(l.room)).join("<br/>")
      return `
        <tr>
          <td><b>${escapeHtml(r.code)}</b> — ${escapeHtml(r.title)}</td>
          <td style="text-align:center">${r.units}</td>
          <td style="text-align:center">${r.contactHours}</td>
          <td style="text-align:center">${timeCell}</td>
          <td style="text-align:center">${dayCell}</td>
          <td style="text-align:center">${roomCell}</td>
          <td style="text-align:center">${escapeHtml(r.courseYear)}</td>
        </tr>`
    })
    .join("")

  const subjectCount = summary.subjects
  const totalUnits = summary.units
  const totalHours = summary.hours
  const preparations = { size: summary.preparations }
  const honorific = "" // gender-neutral: no assumed title
  const salutation = group.facultyName

  return `
    <div class="page">
      <div class="letterhead">
        ${logo ? `<img src="${logo}" alt="SLSU" />` : ""}
        <div class="lh-line1" style="margin-top:6px">Republic of the Philippines</div>
        <div class="lh-line2">SOUTHERN LUZON STATE UNIVERSITY</div>
        <div class="lh-line3">Lucban, Quezon</div>
      </div>

      <div style="text-align:right;font-size:12px;margin:14px 0 4px">${escapeHtml(header.date)}</div>

      <div style="font-size:12px;margin-bottom:2px"><b>${escapeHtml(honorific)}${escapeHtml(group.facultyName.toUpperCase())}</b></div>
      <div style="font-size:12px">${escapeHtml(header.collegeName)}</div>
      <div style="font-size:12px">Southern Luzon State University</div>
      <div style="font-size:12px;margin-bottom:12px">Lucban, Quezon</div>

      <div style="font-size:12px;margin-bottom:10px">Dear ${escapeHtml(salutation)},</div>

      <div style="font-size:12px;margin-bottom:10px;text-indent:28px">
        Please be informed of your teaching load in the ${escapeHtml(header.collegeName)} this
        ${escapeHtml(header.semesterLabel)} AY ${escapeHtml(header.academicYear)}.
      </div>

      <table class="grid">
        <thead>
          <tr>
            <th style="width:30%">Subject/s (Code &amp; Description)</th>
            <th style="width:8%">Units</th>
            <th style="width:9%">Contact Hours</th>
            <th style="width:16%">Time</th>
            <th style="width:11%">Day</th>
            <th style="width:11%">Room</th>
            <th style="width:14%">Course &amp; Year</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <table style="margin-top:12px;font-size:12px;width:70%">
        <tr><td style="width:60%">No. of Subject(s)</td><td>: ${subjectCount}</td></tr>
        <tr><td>No. of Preparation(s)</td><td>: ${preparations.size}</td></tr>
        <tr><td>No. of Units</td><td>: ${totalUnits}</td></tr>
        <tr><td>No. of Hours/Week</td><td>: ${totalHours}</td></tr>
        <tr><td>Other Assignment</td><td>: ______________________</td></tr>
        <tr><td>Excess Load</td><td>: ______________________</td></tr>
      </table>

      <div style="font-size:12px;margin-top:14px">Classes will start on ${escapeHtml(header.classesStartDate)}.</div>
      <div style="font-size:12px;margin-top:6px">Please be guided accordingly.</div>

      <div class="sig-row">
        <div class="sig" style="flex:0 0 46%">
          Noted by:
          <div class="name">${escapeHtml(sig.notedByName)}</div>
          <div class="pos">${escapeHtml(sig.notedByPosition)}</div>
        </div>
        <div class="sig" style="flex:0 0 46%">
          Very truly yours,
          <div class="name">${escapeHtml(sig.deanName)}</div>
          <div class="pos">${escapeHtml(sig.deanPosition)}</div>
        </div>
      </div>
    </div>`
}

export function buildTeachingLoadHtml(opts: {
  entries: ExportEntry[]
  header: ExportHeader
  signatories: Signatories
  logoDataUrl: string
}): string {
  const groups = groupByFaculty(opts.entries)
  const pages = groups
    .map((g) => teachingLoadPage(g, opts.header, opts.signatories, opts.logoDataUrl))
    .join("")
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>Teaching Load — ${escapeHtml(opts.header.semesterLabel)} ${escapeHtml(opts.header.academicYear)}</title>
    <style>${PRINT_BASE_CSS}</style></head>
    <body>${pages || '<div class="page"><p>No entries to export.</p></div>'}</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.3  Room Occupancy — colour-coded room × time matrix, one page per building
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors the on-screen grid (components/rooms/room-occupancy-view.tsx) exactly:
// same department colours (lib/department-colors.ts), same grid bounds — the
// caller passes its own GRID_START_MIN/GRID_END_MIN/SLOT_MIN so the two can never
// drift apart.

import { departmentColor } from "@/lib/department-colors"

export interface OccupancyExportBlock {
  day: string
  startTime: string
  endTime: string
  subjectCode: string
  section: string
  merged: boolean
  departmentId: string
}
export interface OccupancyExportRoom {
  id: string
  code: string
  name: string
  occupancy: OccupancyExportBlock[]
}
export interface OccupancyExportBuilding {
  id: string
  code: string
  name: string
  rooms: OccupancyExportRoom[]
}
export interface OccupancyExportDepartment {
  id: string
  abbreviation: string
  name: string
}

const OCC_DAY_FULL: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday",
}

function occupancyMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

/** One day's room × time table for a single building. */
function occupancyDayTable(
  building: OccupancyExportBuilding,
  day: string,
  gridStartMin: number,
  slotCount: number,
  slotMin: number,
  colorOf: (deptId: string) => { bg: string; fg: string; border: string }
): string {
  const hourLabels: string[] = []
  for (let i = 0; i < slotCount; i += 2) {
    const mins = gridStartMin + i * slotMin
    const h = Math.floor(mins / 60)
    const suffix = h >= 12 ? "PM" : "AM"
    const h12 = h % 12 === 0 ? 12 : h % 12
    hourLabels.push(`${h12} ${suffix}`)
  }

  const rows = building.rooms
    .map((room) => {
      const blocks = [...room.occupancy.filter((o) => o.day === day)].sort(
        (a, b) => occupancyMinutes(a.startTime) - occupancyMinutes(b.startTime)
      )
      const cells: string[] = []
      let cursor = 0
      for (const block of blocks) {
        const startCol = Math.max(0, Math.round((occupancyMinutes(block.startTime) - gridStartMin) / slotMin))
        const endCol = Math.min(slotCount, Math.round((occupancyMinutes(block.endTime) - gridStartMin) / slotMin))
        if (startCol >= slotCount || endCol <= cursor) continue
        if (startCol > cursor) cells.push(`<td colspan="${startCol - cursor}"></td>`)
        const c = colorOf(block.departmentId)
        const label = `${escapeHtml(block.subjectCode)} — ${escapeHtml(block.section)}${block.merged ? " (merged)" : ""}`
        cells.push(
          `<td colspan="${Math.max(1, endCol - startCol)}" style="background:${c.bg};color:${c.fg};border-color:${c.border};font-size:8px;padding:2px;text-align:center;line-height:1.15">${label}</td>`
        )
        cursor = endCol
      }
      if (cursor < slotCount) cells.push(`<td colspan="${slotCount - cursor}"></td>`)
      return `<tr><td class="occ-room">${escapeHtml(room.code)}</td>${cells.join("")}</tr>`
    })
    .join("")

  return `
    <div style="margin-top:10px">
      <div style="font-weight:bold;font-size:11px;margin-bottom:3px">${OCC_DAY_FULL[day] ?? day}</div>
      <table class="occ-grid">
        <thead>
          <tr>
            <th class="occ-room">Room</th>
            ${hourLabels.map((l) => `<th colspan="2">${l}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td class="occ-room"></td><td colspan="${slotCount}" style="text-align:center;color:#888">No rooms in this building</td></tr>`}</tbody>
      </table>
    </div>`
}

/**
 * Colour-coded room × time matrix, one printable page per building, all six days.
 * Visually mirrors the on-screen Room Occupancy grid by construction — same
 * colours, same bounds, same data — so the export can never drift from the view.
 */
export function buildRoomOccupancyHtml(opts: {
  buildings: OccupancyExportBuilding[]
  departments: OccupancyExportDepartment[]
  semesterLabel: string
  academicYear: string
  logoDataUrl: string
  gridStartMin: number
  gridEndMin: number
  slotMin: number
}): string {
  const abbrById = new Map(opts.departments.map((d) => [d.id, d.abbreviation]))
  const colorOf = (deptId: string) => departmentColor(abbrById.get(deptId))
  const slotCount = Math.round((opts.gridEndMin - opts.gridStartMin) / opts.slotMin)

  const legend = opts.departments
    .map((d) => {
      const c = departmentColor(d.abbreviation)
      return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px"><span style="display:inline-block;width:9px;height:9px;background:${c.bg};border:1px solid ${c.border}"></span>${escapeHtml(d.abbreviation)}</span>`
    })
    .join("")

  const pages = (opts.buildings.length ? opts.buildings : [])
    .map((b) => {
      const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
      const tables = days.map((d) => occupancyDayTable(b, d, opts.gridStartMin, slotCount, opts.slotMin, colorOf)).join("")
      return `
        <div class="page occ-page">
          <div class="letterhead">
            ${opts.logoDataUrl ? `<img src="${opts.logoDataUrl}" alt="SLSU" />` : ""}
            <div class="lh-line2" style="margin-top:8px">ROOM OCCUPANCY — ${escapeHtml(b.name.toUpperCase())}</div>
            <div class="lh-line1">${escapeHtml(opts.semesterLabel)}, AY ${escapeHtml(opts.academicYear)} · Building ${escapeHtml(b.code)}</div>
          </div>
          <div style="margin:8px 0;font-size:10px">${legend}</div>
          ${tables}
        </div>`
    })
    .join("")

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>Room Occupancy — ${escapeHtml(opts.semesterLabel)} ${escapeHtml(opts.academicYear)}</title>
    <style>${PRINT_BASE_CSS}
      .occ-page { padding: 14px 16px 24px; }
      .occ-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .occ-grid th, .occ-grid td { border: 1px solid #999; }
      .occ-grid th { background: #f0f0f0; font-size: 8px; font-weight: normal; padding: 2px 0; }
      .occ-room { width: 70px; font-size: 9px; font-weight: bold; padding: 2px 4px; background: #fafafa; }
      @media print { @page { size: A4 landscape; margin: 8mm; } }
    </style></head>
    <body>${pages || '<div class="page"><p>No buildings to export.</p></div>'}</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared client helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch an image URL and return it as a base64 data URL (works in print windows). */
export async function fetchLogoDataUrl(url = "/images/slsu-seal.png"): Promise<string> {
  try {
    const res = await fetch(url)
    if (!res.ok) return ""
    const blob = await res.blob()
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve("")
      reader.readAsDataURL(blob)
    })
  } catch {
    return ""
  }
}

/** Open the given HTML in a new window and trigger the print dialog. */
export function openPrintWindow(html: string): void {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.onload = () => w.print()
  setTimeout(() => {
    if (!w.closed) w.print()
  }, 800)
}

/** Format a Date (or ISO string) as e.g. "August 28, 2026". */
export function formatLongDate(d: Date | string | null | undefined): string {
  if (!d) return ""
  const date = typeof d === "string" ? new Date(d) : d
  if (isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}
