// Cross-Schedule Conflict Detection Service
//
// lib/services/conflicts.ts only ever looks WITHIN a single schedule's entries.
// That misses a real failure mode of this system's workflow: a Dept Chair
// (SUPER_ADMIN) generating GEC/minor subjects can double-book a room, faculty
// member, or section that ANOTHER department's already-submitted/published
// schedule is also using for the same semester. This module compares two
// entry sets — the newly-generated schedule's entries ("A") against entries
// pulled from other departments' schedules ("B") — and reports overlaps.
//
// Pure / side-effect-free: no DB access here. The caller (generate/route.ts)
// is responsible for hydrating both entry arrays and persisting ConflictLog
// rows for any hits returned.

type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY'

export type CrossScheduleConflictType =
  | 'CROSS_SCHEDULE_ROOM_OVERLAP'
  | 'CROSS_SCHEDULE_FACULTY_OVERLAP'
  | 'CROSS_SCHEDULE_SECTION_OVERLAP'

export interface CrossScheduleEntry {
  id: string
  scheduleId: string
  day: DayOfWeek | string
  startTime: string
  endTime: string
  roomId: string
  roomCode: string
  facultyId: string
  facultyName: string
  sectionId: string
  sectionName: string
  subjectCode: string
  // Lab split-group marker ("A"/"B"). Entries from different sets on the same
  // section/time are independent student groups, not a real conflict — mirrors
  // the same rule in lib/services/conflicts.ts's detectSectionOverlaps.
  set?: string | null
}

export interface CrossScheduleConflict {
  type: CrossScheduleConflictType
  description: string
  entryIdA: string
  scheduleIdA: string
  entryIdB: string
  scheduleIdB: string
}

// ---------------------------------------------------------------------------
// Helpers — mirrors lib/services/conflicts.ts's toMinutes/timesOverlap.
// conflicts.ts does not export these, so they're duplicated here rather than
// modifying that file (per spec: use it as a style/shape reference only).
// ---------------------------------------------------------------------------

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  const [start1, end1] = [toMinutes(s1), toMinutes(e1)]
  const [start2, end2] = [toMinutes(s2), toMinutes(e2)]
  return start1 < end2 && start2 < end1
}

/**
 * Compare every entry in `entriesA` (the schedule that was just generated)
 * against every entry in `entriesB` (entries belonging to OTHER schedules —
 * `entriesB` may mix entries from several different scheduleIds together;
 * each entry carries its own `scheduleId` so hits stay attributable).
 *
 * This is intentionally a full A×B cross product, NOT a check within either
 * array — intra-schedule overlaps are already handled by
 * lib/services/conflicts.ts elsewhere in the workflow (publish route).
 *
 * A single overlapping pair can produce more than one conflict record (e.g.
 * same room AND same faculty at once) — one record is emitted per dimension
 * that collides.
 */
export function detectCrossScheduleConflicts(
  entriesA: CrossScheduleEntry[],
  entriesB: CrossScheduleEntry[]
): CrossScheduleConflict[] {
  const conflicts: CrossScheduleConflict[] = []

  for (const a of entriesA) {
    for (const b of entriesB) {
      // Safety guard: this function is for cross-schedule comparisons only.
      // If a caller accidentally includes same-schedule entries in B, skip them
      // rather than reporting a false cross-schedule conflict.
      if (a.scheduleId === b.scheduleId) continue
      if (a.day !== b.day) continue
      if (!timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue

      if (a.roomId === b.roomId) {
        conflicts.push({
          type: 'CROSS_SCHEDULE_ROOM_OVERLAP',
          description:
            `Room "${a.roomCode}" is double-booked on ${a.day}: ` +
            `"${a.subjectCode}" (${a.startTime}-${a.endTime}) overlaps with ` +
            `"${b.subjectCode}" (${b.startTime}-${b.endTime}) from another department's schedule`,
          entryIdA: a.id,
          scheduleIdA: a.scheduleId,
          entryIdB: b.id,
          scheduleIdB: b.scheduleId,
        })
      }

      if (a.facultyId === b.facultyId) {
        conflicts.push({
          type: 'CROSS_SCHEDULE_FACULTY_OVERLAP',
          description:
            `Faculty "${a.facultyName}" is double-booked on ${a.day}: ` +
            `"${a.subjectCode}" (${a.startTime}-${a.endTime}) overlaps with ` +
            `"${b.subjectCode}" (${b.startTime}-${b.endTime}) from another department's schedule`,
          entryIdA: a.id,
          scheduleIdA: a.scheduleId,
          entryIdB: b.id,
          scheduleIdB: b.scheduleId,
        })
      }

      if (a.sectionId === b.sectionId && !(a.set && b.set && a.set !== b.set)) {
        conflicts.push({
          type: 'CROSS_SCHEDULE_SECTION_OVERLAP',
          description:
            `Section "${a.sectionName}" is double-booked on ${a.day}: ` +
            `"${a.subjectCode}" (${a.startTime}-${a.endTime}) overlaps with ` +
            `"${b.subjectCode}" (${b.startTime}-${b.endTime}) from another department's schedule`,
          entryIdA: a.id,
          scheduleIdA: a.scheduleId,
          entryIdB: b.id,
          scheduleIdB: b.scheduleId,
        })
      }
    }
  }

  return conflicts
}
