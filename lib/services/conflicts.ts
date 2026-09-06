// Conflict Detection Service
// Analyzes schedule entries and reports overlaps, capacity issues, and load violations

type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY'

type ConflictType =
  | 'FACULTY_OVERLAP'
  | 'ROOM_OVERLAP'
  | 'SECTION_OVERLAP'
  | 'LOAD_EXCEEDED'
  // A laboratory is split into two student groups; both must be scheduled.
  // Raised by lib/services/term-conflicts.ts, not by detectConflicts().
  | 'INCOMPLETE_LAB_SETS'
  // Room capacity check removed — capacity field removed from Room model

type ConflictSeverity = 'ERROR' | 'WARNING'

export interface Conflict {
  type: ConflictType
  severity: ConflictSeverity
  description: string
  entryIds: string[]
}

export interface ScheduleEntry {
  id: string
  subjectId: string
  subjectCode: string
  subjectType: 'LECTURE' | 'LABORATORY'
  subjectUnits: number
  facultyId: string
  facultyName: string
  facultyMaxUnits: number
  roomId: string
  roomCode: string
  sectionId: string
  sectionName: string
  sectionCapacity: number
  day: DayOfWeek
  startTime: string
  endTime: string
  set?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const group = map.get(key)
    if (group) {
      group.push(item)
    } else {
      map.set(key, [item])
    }
  }
  return map
}

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
 * Given a list of entries that share a resource on the same day,
 * return pairs of entries whose times overlap.
 */
function findTimeOverlaps(entries: ScheduleEntry[]): [ScheduleEntry, ScheduleEntry][] {
  const pairs: [ScheduleEntry, ScheduleEntry][] = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]
      const b = entries[j]
      if (a.day === b.day && timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        pairs.push([a, b])
      }
    }
  }
  return pairs
}

// ---------------------------------------------------------------------------
// Conflict detectors
// ---------------------------------------------------------------------------

function detectFacultyOverlaps(entries: ScheduleEntry[]): Conflict[] {
  const conflicts: Conflict[] = []
  const byFacultyDay = groupBy(entries, e => `${e.facultyId}::${e.day}`)

  for (const [, group] of byFacultyDay) {
    if (group.length < 2) continue
    const overlaps = findTimeOverlaps(group)
    for (const [a, b] of overlaps) {
      conflicts.push({
        type: 'FACULTY_OVERLAP',
        severity: 'ERROR',
        description:
          `Faculty "${a.facultyName}" is double-booked on ${a.day}: ` +
          `"${a.subjectCode}" (${a.startTime}-${a.endTime}) overlaps with ` +
          `"${b.subjectCode}" (${b.startTime}-${b.endTime})`,
        entryIds: [a.id, b.id],
      })
    }
  }

  return conflicts
}

function detectRoomOverlaps(entries: ScheduleEntry[]): Conflict[] {
  const conflicts: Conflict[] = []
  const byRoomDay = groupBy(entries, e => `${e.roomId}::${e.day}`)

  for (const [, group] of byRoomDay) {
    if (group.length < 2) continue
    const overlaps = findTimeOverlaps(group)
    for (const [a, b] of overlaps) {
      conflicts.push({
        type: 'ROOM_OVERLAP',
        severity: 'ERROR',
        description:
          `Room "${a.roomCode}" is double-booked on ${a.day}: ` +
          `"${a.subjectCode}" (${a.startTime}-${a.endTime}) overlaps with ` +
          `"${b.subjectCode}" (${b.startTime}-${b.endTime})`,
        entryIds: [a.id, b.id],
      })
    }
  }

  return conflicts
}

function detectSectionOverlaps(entries: ScheduleEntry[]): Conflict[] {
  const conflicts: Conflict[] = []
  const bySectionDay = groupBy(entries, e => `${e.sectionId}::${e.day}`)

  for (const [, group] of bySectionDay) {
    if (group.length < 2) continue
    const overlaps = findTimeOverlaps(group)
    for (const [a, b] of overlaps) {
      // Lab entries with different sets are independent student groups — not a conflict
      if (a.set && b.set && a.set !== b.set) continue
      conflicts.push({
        type: 'SECTION_OVERLAP',
        severity: 'ERROR',
        description:
          `Section "${a.sectionName}" is double-booked on ${a.day}: ` +
          `"${a.subjectCode}" (${a.startTime}-${a.endTime}) overlaps with ` +
          `"${b.subjectCode}" (${b.startTime}-${b.endTime})`,
        entryIds: [a.id, b.id],
      })
    }
  }

  return conflicts
}

function detectLoadExceeded(entries: ScheduleEntry[], maxWeeklyUnits = 21): Conflict[] {
  const conflicts: Conflict[] = []
  const byFaculty = groupBy(entries, e => e.facultyId)

  for (const [, group] of byFaculty) {
    const faculty = group[0]
    const limit = faculty.facultyMaxUnits || maxWeeklyUnits

    // Count unique subjects to avoid double-counting units for multi-session subjects
    const subjectUnitsMap = new Map<string, number>()
    for (const entry of group) {
      subjectUnitsMap.set(entry.subjectId, entry.subjectUnits)
    }
    const totalUnits = Array.from(subjectUnitsMap.values()).reduce((sum, u) => sum + u, 0)

    if (totalUnits > limit) {
      conflicts.push({
        type: 'LOAD_EXCEEDED',
        severity: 'WARNING',
        description:
          `Faculty "${faculty.facultyName}" is assigned ${totalUnits} units ` +
          `which exceeds the maximum of ${limit} units per week`,
        entryIds: group.map(e => e.id),
      })
    }
  }

  return conflicts
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function detectConflicts(
  entries: ScheduleEntry[],
  options: { maxWeeklyUnits?: number } = {}
): Conflict[] {
  const { maxWeeklyUnits = 21 } = options

  return [
    ...detectFacultyOverlaps(entries),
    ...detectRoomOverlaps(entries),
    ...detectSectionOverlaps(entries),
    ...detectLoadExceeded(entries, maxWeeklyUnits),
  ]
}
