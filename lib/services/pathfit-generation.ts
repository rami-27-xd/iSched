import { db } from "@/lib/db"
import { getCurriculumCodes, hasCurriculumMap } from "@/lib/curriculum-map"
import { ensurePathfitVenues } from "@/lib/services/sentinels"
import { PATHFIT_VENUES } from "@/lib/sentinels"
import { specializationsCoverSubject } from "@/lib/specialization-match"
import { syncFacultySpecializations } from "@/lib/services/sync-specializations"
import { createNotification } from "@/lib/notifications"
import { recordAudit } from "@/lib/audit"

/**
 * PATHFit generation — run by the single PATHFIT Director account.
 *
 * Places every PATHFit class for every section of the schedule's department as
 * ONE continuous block (a 2-hour class is a single 2-hour session, never split
 * across days), with
 *   - a REAL instructor — one of the PATHFit faculty the Director added (tagged
 *     for the subject, available at that time, not double-booked, within their
 *     weekly hours). There is no TBA instructor any more;
 *   - one of the three PATHFit venues — Gymnasium (4 classes at once), Covered
 *     Court (4) and Field (2). A venue is shared, so the only limit on it is how
 *     many PATHFit classes may run in it at the same moment.
 * Also respected: each section's own timetable (this schedule's other entries +
 * every other non-archived schedule of the same semester) and the Saturday rule.
 *
 * Regeneration is scoped: only this schedule's PATHFit entries (for the
 * sections in scope) are replaced; GEC and major entries are untouched.
 */
export type PathfitGenerationResult =
  | { ok: true; body: { entriesGenerated: number; unassignedCount: number; pathfitPlaced: number; generatedAt: string } }
  | { ok: false; status: number; error: string; details?: string[] }

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const
const WINDOW_START = 7 * 60 + 30 // 07:30
const WINDOW_END = 18 * 60 //       18:00
const STEP = 30

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2

export async function runPathfitGeneration(scheduleId: string, dbUser: any): Promise<PathfitGenerationResult> {
  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { semester: true, department: { include: { college: true } } },
  })
  if (!schedule) return { ok: false, status: 404, error: "Schedule not found" }
  if (schedule.isArchived) return { ok: false, status: 400, error: "This schedule is archived" }
  if (!schedule.departmentId) return { ok: false, status: 400, error: "This schedule is not linked to a department" }

  const pathfitSubjects = await db.subject.findMany({
    where: { code: { startsWith: "PATHFIT", mode: "insensitive" } },
    include: { department: true },
  })
  if (pathfitSubjects.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "No PATHFit subjects found",
      details: ["Add the PATHFit01–04 subjects to the CAS department before generating."],
    }
  }

  const sections = await db.section.findMany({
    where: { yearLevel: { program: { departmentId: schedule.departmentId } } },
    include: {
      yearLevel: {
        include: {
          program: { include: { department: { include: { college: { select: { abbreviation: true } } } } } },
        },
      },
    },
  })
  if (sections.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "No sections found for this department",
      details: ["Add year levels and sections for the programs in this department before generating PATHFit."],
    }
  }

  // ── Instructors: the Director's own PATHFit faculty ───────────────────────
  const allFaculty = await db.faculty.findMany({
    where: { isActive: true, department: { college: { abbreviation: "CAS" } }, user: { isActive: true } },
    select: { id: true, specializations: true, maxHoursPerWeek: true },
  })
  const pathfitFaculty = allFaculty.filter((f) =>
    pathfitSubjects.some((s) => specializationsCoverSubject(f.specializations, s.title, s.code))
  )
  if (pathfitFaculty.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "No PATHFit instructors yet",
      details: [
        "Open Faculty, choose Add Faculty, and tag each PATHFit instructor with the PATHFit subjects they teach.",
        "Then open Faculty Availability and mark the hours they can teach this term.",
      ],
    }
  }
  const availabilityRows = schedule.semesterId
    ? await db.facultyAvailability.findMany({
        where: { semesterId: schedule.semesterId, facultyId: { in: pathfitFaculty.map((f) => f.id) } },
        select: { facultyId: true, day: true, startTime: true, endTime: true },
      })
    : []
  const availByFaculty = new Map<string, { day: string; start: number; end: number }[]>()
  for (const a of availabilityRows) {
    if (!availByFaculty.has(a.facultyId)) availByFaculty.set(a.facultyId, [])
    availByFaculty.get(a.facultyId)!.push({ day: a.day, start: toMin(a.startTime), end: toMin(a.endTime) })
  }

  const venueIds = await ensurePathfitVenues()
  const venues = PATHFIT_VENUES.map((v) => ({ ...v, id: venueIds[v.code] }))

  // Per-program placement from the curriculum map (PATHFit01 is Year 1 / 1st sem
  // for most programs but the map is authoritative); unmapped programs fall back
  // to the subject's own year + semester.
  const semType = schedule.semester?.type as "FIRST" | "SECOND" | undefined
  function takesSubject(sec: any, subj: any): boolean {
    const progAbbr = sec.yearLevel?.program?.abbreviation
    const yl = sec.yearLevel?.level
    if (!progAbbr || !yl) return false
    if (semType && hasCurriculumMap(progAbbr)) {
      return getCurriculumCodes(progAbbr, yl, semType).some((c) => c.toLowerCase() === subj.code.toLowerCase())
    }
    return yl === (subj.year ?? 1) && (!semType || !subj.semester || subj.semester === semType)
  }

  // Everything that must not be displaced: this schedule's non-PATHFit entries and
  // every other non-archived schedule of the same semester.
  const pathfitIds = pathfitSubjects.map((s) => s.id)
  const locked = await db.scheduleEntry.findMany({
    where: {
      OR: [
        { scheduleId, subjectId: { notIn: pathfitIds } },
        { schedule: { semesterId: schedule.semesterId, isArchived: false, id: { not: scheduleId } } },
      ],
    },
    select: { facultyId: true, roomId: true, sectionId: true, set: true, day: true, startTime: true, endTime: true },
  })

  // Occupancy books — seeded from locked entries, extended as classes are placed.
  type Block = { day: string; start: number; end: number }
  const sectionBlocks = new Map<string, Block[]>()
  const facultyBlocks = new Map<string, Block[]>()
  const venueBlocks = new Map<string, Block[]>() // roomId → one block per class held there
  const facultyMinutes = new Map<string, number>()
  const add = (m: Map<string, Block[]>, key: string, b: Block) => {
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(b)
  }
  const venueIdSet = new Set(venues.map((v) => v.id))
  for (const e of locked) {
    const b = { day: e.day as string, start: toMin(e.startTime), end: toMin(e.endTime) }
    add(sectionBlocks, e.sectionId, b)
    add(facultyBlocks, e.facultyId, b)
    if (venueIdSet.has(e.roomId)) add(venueBlocks, e.roomId, b)
    facultyMinutes.set(e.facultyId, (facultyMinutes.get(e.facultyId) ?? 0) + (b.end - b.start))
  }

  const isFree = (m: Map<string, Block[]>, key: string, day: string, s: number, e: number) =>
    !(m.get(key) ?? []).some((b) => b.day === day && overlaps(b.start, b.end, s, e))
  const venueLoad = (roomId: string, day: string, s: number, e: number) =>
    (venueBlocks.get(roomId) ?? []).filter((b) => b.day === day && overlaps(b.start, b.end, s, e)).length

  const startedAt = Date.now()
  const rows: any[] = []
  const unassigned: { subjectId: string; sectionId: string; reason: string }[] = []

  let rotate = 0
  for (const sec of sections as any[]) {
    const allowSaturday = sec.yearLevel?.program?.department?.college?.abbreviation === "CAM"
    const days = DAYS.filter((d) => d !== "SATURDAY" || allowSaturday)
    for (const subj of pathfitSubjects as any[]) {
      if (!takesSubject(sec, subj)) continue
      const minutes = Math.max(60, (subj.hoursPerWeek ?? subj.units ?? 2) * 60)
      const candidates = pathfitFaculty.filter((f) => specializationsCoverSubject(f.specializations, subj.title, subj.code))
      if (candidates.length === 0) {
        unassigned.push({ subjectId: subj.id, sectionId: sec.id, reason: `No PATHFit instructor is tagged for ${subj.code} — add one on the Faculty page` })
        continue
      }

      let placed = false
      // Rotate the starting day per section so classes spread over the week.
      for (let di = 0; di < days.length && !placed; di++) {
        const day = days[(di + rotate) % days.length]
        for (let start = WINDOW_START; start + minutes <= WINDOW_END && !placed; start += STEP) {
          const end = start + minutes
          if (!isFree(sectionBlocks, sec.id, day, start, end)) continue
          // Least-loaded instructor first, so the load is shared.
          const ordered = [...candidates].sort((a, b) => (facultyMinutes.get(a.id) ?? 0) - (facultyMinutes.get(b.id) ?? 0))
          const instructor = ordered.find((f) => {
            const avail = availByFaculty.get(f.id) ?? []
            if (!avail.some((a) => a.day === day && a.start <= start && a.end >= end)) return false
            if (!isFree(facultyBlocks, f.id, day, start, end)) return false
            const cap = (f.maxHoursPerWeek ?? 30) * 60
            return (facultyMinutes.get(f.id) ?? 0) + minutes <= cap
          })
          if (!instructor) continue
          // Emptiest venue that still has a free place at this time.
          const venue = venues
            .map((v) => ({ v, load: venueLoad(v.id, day, start, end) }))
            .filter((x) => x.load < x.v.maxConcurrent)
            .sort((a, b) => a.load / a.v.maxConcurrent - b.load / b.v.maxConcurrent)[0]?.v
          if (!venue) continue

          const block = { day, start, end }
          add(sectionBlocks, sec.id, block)
          add(facultyBlocks, instructor.id, block)
          add(venueBlocks, venue.id, block)
          facultyMinutes.set(instructor.id, (facultyMinutes.get(instructor.id) ?? 0) + minutes)
          rows.push({
            scheduleId,
            subjectId: subj.id,
            facultyId: instructor.id,
            facultyName: null,
            roomId: venue.id,
            sectionId: sec.id,
            day,
            startTime: toTime(start),
            endTime: toTime(end),
            createdBy: dbUser.id,
            set: null,
            groupId: null,
          })
          placed = true
        }
      }
      rotate++
      if (!placed) {
        unassigned.push({
          subjectId: subj.id,
          sectionId: sec.id,
          reason: `No free time for ${subj.code}: every slot is taken by the section's other classes, the instructors' availability, or the venues' limits (Gymnasium 4, Covered Court 4, Field 2 at a time)`,
        })
      }
    }
  }

  if (rows.length === 0 && unassigned.length > 0) {
    return {
      ok: false,
      status: 422,
      error: "No PATHFit class could be placed",
      details: [
        "Existing entries have been preserved.",
        ...unassigned.slice(0, 5).map((u) => `• ${u.reason}`),
      ],
    }
  }

  const sectionIds = sections.map((s) => s.id)
  const scope = { scheduleId, subjectId: { in: pathfitIds }, sectionId: { in: sectionIds } }
  await db.scheduleEntry.deleteMany({ where: scope })
  await db.unassignedEntry.deleteMany({ where: scope })
  if (rows.length > 0) await db.scheduleEntry.createMany({ data: rows })
  if (unassigned.length > 0) {
    await db.unassignedEntry.createMany({
      data: unassigned.map((u) => ({ scheduleId, subjectId: u.subjectId, sectionId: u.sectionId, reason: u.reason, generatedBy: dbUser.id })),
    })
  }
  await db.schedule.update({ where: { id: scheduleId }, data: { generatedAt: new Date() } })
  await Promise.all([...new Set(rows.map((r) => r.facultyId as string))].map((fid) => syncFacultySpecializations(fid).catch(() => {})))

  const message =
    unassigned.length > 0
      ? `${rows.length} PATHFit classes placed. ${unassigned.length} could not be placed — see the Unassigned list.`
      : `Done. ${rows.length} PATHFit classes placed.`
  await createNotification({
    userId: dbUser.id,
    title: "PATHFit Generated",
    message,
    type: "schedule_generated",
    link: "/dashboard/schedules",
  })
  await recordAudit({
    actor: dbUser,
    action: "schedule.generated",
    entityType: "schedule",
    entityId: scheduleId,
    departmentId: schedule.departmentId,
    scheduleId,
    summary: `Generated PATHFit for ${schedule.department?.abbreviation ?? "department"} — ${rows.length} classes placed, ${unassigned.length} unplaced`,
    metadata: {
      Mode: "PATHFit (Gymnasium / Covered Court / Field)",
      Term: `${schedule.semester?.type ?? ""}`.trim(),
      "Sections in scope": sections.length,
      "Classes placed": rows.length,
      "Could not be placed": unassigned.length,
      "Took": `${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
    },
  })

  return {
    ok: true,
    body: {
      entriesGenerated: rows.length,
      unassignedCount: unassigned.length,
      pathfitPlaced: rows.length,
      generatedAt: new Date().toISOString(),
    },
  }
}
