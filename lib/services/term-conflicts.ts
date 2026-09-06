// Term-wide (cross-departmental) conflict detection.
//
// Departments plot their schedules independently, but within one semester they draw
// on the SAME pool of rooms and faculty. Checking a schedule against only its own
// entries lets two departments each pass their own validation while booking one room
// — or one lecturer — into the same slot.
//
// Manual entry already checks the whole term (lib/services/entry-validation.ts builds
// `allEntries` from this schedule plus every other non-archived schedule in the same
// semester), and generation feeds the engine the same cross-schedule set as locked
// slots. The gap was at the end of the pipeline: both the pre-publish dialog and the
// publish route itself ran detectConflicts() over `schedule.entries` alone. That
// matters because the force-override path on PATCH /entries/[entryId] lets a chair
// deliberately save an entry the insert-time check rejected, and publish was the last
// gate that could have caught it.
//
// This module is the single place both routes go through, so they can never disagree
// about what counts as a conflict again.
import { db } from "@/lib/db"
import { detectConflicts, type Conflict, type ScheduleEntry } from "./conflicts"

/** Placeholder sentinels — same identifiers entry-validation.ts uses. */
const TBA_EMPLOYEE_ID = "TBA"
const TBA_ROOM_CODE = "TBA"

export interface TermConflict extends Conflict {
  /** True when the conflict involves an entry owned by a DIFFERENT schedule. */
  crossDepartment: boolean
}

/** The other side of a cross-department conflict — who to notify. */
export interface ConflictingDepartment {
  departmentId: string
  departmentAbbr: string
  scheduleId: string
  conflictCount: number
}

/**
 * A laboratory subject is taught to two half-sections, Set A and Set B, each of
 * which needs its own class. Generation always creates both tasks, but if one of
 * them can't be placed it lands in the Unassigned Queue and the other is scheduled
 * alone — leaving half the section with no lab. Manual entry can produce the same
 * state, since the two sets are added one at a time.
 *
 * Reported per (subject, section) within the schedule being checked; sets never
 * span schedules, so this looks at own entries only.
 */
function detectIncompleteLabSets(ownEntries: any[]): Conflict[] {
  const groups = new Map<string, { entries: any[]; sets: Set<string> }>()
  for (const e of ownEntries) {
    if (e.subject?.type !== "LABORATORY") continue
    const key = `${e.subjectId}::${e.sectionId}`
    if (!groups.has(key)) groups.set(key, { entries: [], sets: new Set() })
    const g = groups.get(key)!
    g.entries.push(e)
    if (e.set) g.sets.add(e.set)
  }

  const conflicts: Conflict[] = []
  for (const { entries, sets } of groups.values()) {
    const missing = (["A", "B"] as const).filter((s) => !sets.has(s))
    if (missing.length === 0) continue

    const first = entries[0]
    const code = first.subject?.code ?? "This laboratory"
    const section = first.section?.name ?? "the section"
    const scheduled = sets.size === 0 ? "no set" : `only Set ${[...sets].sort().join(" and ")}`
    conflicts.push({
      type: "INCOMPLETE_LAB_SETS",
      severity: "ERROR",
      description:
        `Laboratory "${code}" for section "${section}" has ${scheduled} scheduled — ` +
        `Set ${missing.join(" and Set ")} ${missing.length > 1 ? "have" : "has"} no class. ` +
        `A laboratory is split into two student groups and both must be scheduled.`,
      entryIds: entries.map((e) => e.id),
    })
  }
  return conflicts
}

const entrySelect = {
  id: true,
  scheduleId: true,
  day: true,
  startTime: true,
  endTime: true,
  subjectId: true,
  facultyId: true,
  roomId: true,
  sectionId: true,
  set: true,
  subject: { select: { code: true, type: true, units: true } },
  faculty: {
    select: { employeeId: true, maxUnitsPerWeek: true, user: { select: { firstName: true, lastName: true } } },
  },
  room: { select: { code: true } },
  section: { select: { name: true, capacity: true } },
  schedule: { select: { department: { select: { id: true, abbreviation: true, name: true } } } },
} as const

/**
 * Maps a DB entry into the shape detectConflicts() expects.
 *
 * TBA faculty and the TBA room are placeholders, not real resources — many entries
 * legitimately share them. Giving each such entry its own synthetic id keeps them
 * from colliding with each other while leaving every real booking intact. Without
 * this, widening the check to the whole term would turn every pair of TBA entries
 * into a blocking conflict.
 */
function toConflictEntry(e: any): ScheduleEntry {
  const isTbaFaculty = e.faculty?.employeeId === TBA_EMPLOYEE_ID
  const isTbaRoom = e.room?.code === TBA_ROOM_CODE
  return {
    id: e.id,
    day: e.day,
    startTime: e.startTime,
    endTime: e.endTime,
    subjectId: e.subjectId,
    subjectCode: e.subject?.code ?? "",
    subjectType: e.subject?.type ?? "LECTURE",
    subjectUnits: e.subject?.units ?? 0,
    facultyId: isTbaFaculty ? `tba-faculty::${e.id}` : e.facultyId,
    facultyName: `${e.faculty?.user?.firstName ?? ""} ${e.faculty?.user?.lastName ?? ""}`.trim(),
    facultyMaxUnits: e.faculty?.maxUnitsPerWeek ?? 0,
    roomId: isTbaRoom ? `tba-room::${e.id}` : e.roomId,
    roomCode: e.room?.code ?? "",
    sectionId: e.sectionId,
    sectionName: e.section?.name ?? "",
    sectionCapacity: e.section?.capacity ?? 0,
    // Load-bearing: detectSectionOverlaps() treats lab Set A and Set B as independent
    // student groups only when both carry a set. Dropping it reports every Set A/Set B
    // pair as a section double-booking.
    set: e.set ?? null,
  }
}

/**
 * Detects conflicts for `scheduleId` against EVERY non-archived schedule sharing its
 * semester, then narrows the result to conflicts this schedule is actually part of —
 * a chair should never be blocked by two other departments clashing with each other.
 *
 * Cross-departmental conflicts get the owning department appended to their description
 * so the message says who to talk to.
 */
export async function detectTermConflicts(scheduleId: string): Promise<{
  conflicts: TermConflict[]
  entryCount: number
  termEntryCount: number
  /** Departments on the other side of a cross-department conflict — notify them. */
  conflictingDepartments: ConflictingDepartment[]
}> {
  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    select: { semesterId: true },
  })

  const ownEntries = await db.scheduleEntry.findMany({
    where: { scheduleId },
    select: entrySelect,
  })

  // Every other department's entries for the same term. Archived schedules are
  // excluded — they no longer hold a claim on a room or a lecturer.
  const foreignEntries = schedule?.semesterId
    ? await db.scheduleEntry.findMany({
        where: {
          scheduleId: { not: scheduleId },
          schedule: { semesterId: schedule.semesterId, isArchived: false },
        },
        select: entrySelect,
      })
    : []

  const ownIds = new Set(ownEntries.map((e) => e.id))
  const ownerByEntryId = new Map<string, { abbr: string; departmentId: string; scheduleId: string }>()
  for (const e of foreignEntries) {
    const dept = (e as any).schedule?.department
    ownerByEntryId.set(e.id, {
      abbr: dept?.abbreviation ?? dept?.name ?? "another department",
      departmentId: dept?.id ?? "",
      scheduleId: e.scheduleId,
    })
  }

  const all = [...ownEntries, ...foreignEntries].map(toConflictEntry)
  const raw = [...detectConflicts(all), ...detectIncompleteLabSets(ownEntries)]

  const conflicts: TermConflict[] = []
  const byDept = new Map<string, ConflictingDepartment>()

  for (const c of raw) {
    // Only report what this schedule is involved in.
    if (!c.entryIds.some((id) => ownIds.has(id))) continue

    const foreign = c.entryIds.filter((id) => !ownIds.has(id))
    if (foreign.length === 0) {
      conflicts.push({ ...c, crossDepartment: false })
      continue
    }

    const owners = foreign.map((id) => ownerByEntryId.get(id)).filter(Boolean) as {
      abbr: string; departmentId: string; scheduleId: string
    }[]
    for (const o of owners) {
      if (!o.departmentId) continue
      const existing = byDept.get(o.departmentId)
      if (existing) existing.conflictCount++
      else byDept.set(o.departmentId, {
        departmentId: o.departmentId,
        departmentAbbr: o.abbr,
        scheduleId: o.scheduleId,
        conflictCount: 1,
      })
    }

    const depts = [...new Set(owners.map((o) => o.abbr))]
    conflicts.push({
      ...c,
      crossDepartment: true,
      description: `${c.description} — shared with ${depts.join(", ") || "another department"} in this same semester. Rooms and faculty are shared across departments, so this must be resolved with them before publishing.`,
    })
  }

  return {
    conflicts,
    entryCount: ownEntries.length,
    termEntryCount: all.length,
    conflictingDepartments: [...byDept.values()],
  }
}
