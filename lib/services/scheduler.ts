// Constraint-Based Scheduling Engine with Backtracking Algorithm
// Uses MRV (Minimum Remaining Values) and LCV (Least Constraining Value) heuristics
//
// KEY CONCEPT: The engine schedules "tasks" — each task is a (subject × section) pair.
// Every section at a given year level must have all subjects for that year scheduled.
//
// HARD CONSTRAINT EVALUATION ORDER (applied at candidate-init time for max pruning):
//   1. Lab specialization match  — eliminates mismatched room types early
//   2. Building availability     — eliminates rooms in buildings faculty can't reach
//   3. Room type compatibility   — eliminates wrong room category
//   4. Faculty specialization    — eliminates faculty who can't teach the subject
//   5. Slot-based overlap checks — applied in isConsistentFast during backtracking

type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY'

interface SubjectInput {
  id: string
  code: string
  title: string
  hoursPerWeek: number
  type: 'LECTURE' | 'LABORATORY'
  requiredRoomType: string[]
  units: number
  year: number
  departmentCode?: string
  // null = department-wide / GEC subject → matches sections from any program in the dept.
  programId?: string | null
  // When set, only rooms whose labSpecialization matches exactly are valid (Hard Constraint).
  requiredLabSpecialization?: string | null
  // Curriculum-map override: exact sections this subject may be scheduled into.
  //   undefined/null → fall back to year+programId matching.
  //   []             → subject is not needed for any section in this run; skip silently.
  // Used for GEC subjects whose year/semester placement varies per program.
  allowedSectionIds?: string[] | null
}

interface FacultyInput {
  id: string
  name: string
  specializations: string[]
  sectionCounts?: Record<string, number>
  maxUnitsPerWeek: number
  availability: {
    day: DayOfWeek
    startTime: string
    endTime: string
  }[]
  // Buildings this faculty member is available to teach in for the semester.
  // Empty array = no restriction (legacy data fallback).
  // Enforced as a Hard Constraint when enforceBuildingAvailability is true.
  allowedBuildingIds: string[]
}

interface RoomInput {
  id: string
  code: string
  type: string
  buildingId: string
  buildingCode?: string
  // Populated for LABORATORY / COMPUTER_LAB rooms.
  // Matched against SubjectInput.requiredLabSpecialization (Hard Constraint).
  labSpecialization?: string | null
  // Program (course) access restriction. Empty/undefined = open to every
  // section in this run; non-empty = only sections of these programs may be
  // scheduled here (Hard Constraint).
  allowedProgramIds?: string[]
}

interface SectionInput {
  id: string
  name: string
  yearLevel: number
  // The program this section belongs to (via yearLevel.programId).
  programId: string | null
  // Saturday classes are reserved for CAM (College of Allied Medicine) sections
  // and NSTP subjects (Hard Constraint). Computed by the caller from the
  // section's program → department → college.
  allowSaturday?: boolean
}

interface SessionSlot {
  day: DayOfWeek
  startTime: string
  endTime: string
}

interface Assignment {
  subjectId: string
  facultyId: string
  roomId: string
  sectionId: string
  day: DayOfWeek
  startTime: string
  endTime: string
  // Additional sessions for multi-day subjects (lectures split across days).
  // Labs always have extraSessions = [] — they run as one continuous block.
  extraSessions: SessionSlot[]
  // Present only for laboratory subjects — identifies which student group this slot serves.
  // Set A and Set B are scheduled independently so they get genuinely different time slots.
  set?: 'A' | 'B'
}

export interface UnassignedTask {
  subjectId: string
  subjectCode: string
  subjectTitle: string
  sectionId: string
  sectionName: string
  reason: string
}

// Pre-existing schedule entries that must be treated as already-occupied slots.
// Used to seed the engine when regenerating a subset of subjects (e.g. GEC only)
// so the engine respects slots already held by major-subject entries — and when
// checking cross-schedule room/faculty availability for concurrent departments.
export interface LockedEntry {
  facultyId: string
  roomId: string
  sectionId: string
  set?: string | null
  day: string
  startTime: string
  endTime: string
}

export interface GenerationResult {
  assignments: Assignment[]
  unassigned: UnassignedTask[]
}

interface SchedulingTask {
  taskId: string // `${subjectId}__${sectionId}` for lectures, `${subjectId}__${sectionId}__A/B` for labs
  subjectId: string
  sectionId: string
  subject: SubjectInput
  section: SectionInput
  // Present only for lab subjects — each lab becomes two independent tasks.
  set?: 'A' | 'B'
}

export interface ScheduleConstraints {
  noFacultyOverlap: boolean
  noRoomOverlap: boolean
  noSectionOverlap: boolean
  respectFacultyAvail: boolean
  respectRoomType: boolean
  // Hard Constraint: faculty cannot be assigned to a building not in their allowedBuildingIds.
  enforceBuildingAvailability: boolean
  // Hard Constraint: subjects with requiredLabSpecialization can only use matching rooms.
  enforceLabSpecialization: boolean
  maxDailyLoad: number
  maxWeeklyUnits: number
  noBackToBackLab: boolean
  preferMorningSlots: boolean
}

const DEFAULT_CONSTRAINTS: ScheduleConstraints = {
  noFacultyOverlap: true,
  noRoomOverlap: true,
  noSectionOverlap: true,
  respectFacultyAvail: true,
  respectRoomType: true,
  enforceBuildingAvailability: true,
  enforceLabSpecialization: true,
  maxDailyLoad: 10,
  maxWeeklyUnits: 30,
  noBackToBackLab: true,
  preferMorningSlots: false,
}

const MAX_BACKTRACK_MS = 8_000
const MAX_CANDIDATES_PER_TASK = 200
// For greedy-only runs, early-stop candidate collection at this limit.
// With upfront shuffling of faculty/rooms/patterns, 80 diverse candidates per task
// gives the greedy algorithm enough flexibility without slowing enumeration.
const MAX_CANDIDATES_GREEDY = 80

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
const TIMEOUT_CHECK_INTERVAL = 200
// Beyond this many tasks, backtracking provably cannot finish before the timeout.
// Keep low so GEC/PATHFIT runs (many sections) always use fast greedy mode.
const GREEDY_ONLY_THRESHOLD = 60

// Room types that count as a laboratory for the specialization rules.
const LAB_ROOM_TYPES = new Set(['LABORATORY', 'COMPUTER_LAB', 'LECTURE_LAB'])

// Predefined day-group patterns per total credit hours.
// Lectures are distributed across multiple days; labs run as one continuous block.
// Each entry: { days — the days to use in order; minutesEach — session length per day }
const SESSION_DAY_GROUPS: Record<number, { days: DayOfWeek[]; minutesEach: number }[]> = {
  1: [
    { days: ['MONDAY'],    minutesEach: 60 },
    { days: ['TUESDAY'],   minutesEach: 60 },
    { days: ['WEDNESDAY'], minutesEach: 60 },
    { days: ['THURSDAY'],  minutesEach: 60 },
    { days: ['FRIDAY'],    minutesEach: 60 },
    { days: ['SATURDAY'],  minutesEach: 60 },
  ],
  2: [
    { days: ['MONDAY',   'WEDNESDAY'], minutesEach: 60 },
    { days: ['TUESDAY',  'THURSDAY'],  minutesEach: 60 },
    { days: ['MONDAY',   'FRIDAY'],    minutesEach: 60 },
    { days: ['WEDNESDAY','FRIDAY'],    minutesEach: 60 },
    { days: ['TUESDAY',  'SATURDAY'],  minutesEach: 60 },
    { days: ['THURSDAY', 'SATURDAY'],  minutesEach: 60 },
  ],
  3: [
    { days: ['MONDAY',   'WEDNESDAY', 'FRIDAY'],   minutesEach: 60 },  // MWF 1h×3
    { days: ['TUESDAY',  'THURSDAY',  'SATURDAY'], minutesEach: 60 },  // TThS 1h×3
    { days: ['TUESDAY',  'THURSDAY'],              minutesEach: 90 },  // TTh 1.5h×2
    { days: ['MONDAY',   'THURSDAY'],              minutesEach: 90 },  // MTh 1.5h×2
    { days: ['MONDAY',   'WEDNESDAY'],             minutesEach: 90 },  // MW 1.5h×2
    { days: ['WEDNESDAY','FRIDAY'],                minutesEach: 90 },  // WF 1.5h×2
  ],
}

export class SchedulingError extends Error {
  constructor(message: string, public details?: string[]) {
    super(message)
    this.name = 'SchedulingError'
  }
}

export class SchedulingEngine {
  private assignments: Assignment[] = []
  private constraints: ScheduleConstraints
  private tasks: SchedulingTask[] = []
  // Subjects that had no matching sections at task-build time — reported as unassigned.
  private noSectionSubjects: UnassignedTask[] = []

  private subjectMap: Map<string, SubjectInput>
  private facultyMap: Map<string, FacultyInput>
  private roomMap: Map<string, RoomInput>

  private taskCandidates: Map<string, Assignment[]>

  // Slot-based occupancy maps for O(1) conflict detection.
  // key = "id|day|minuteSlot"
  private facultySlots: Map<string, boolean> = new Map()
  private roomSlots: Map<string, boolean> = new Map()
  private sectionSlots: Map<string, boolean> = new Map()

  private facultyDailyMinutes: Map<string, number> = new Map()
  private facultyWeeklyUnits: Map<string, number> = new Map()
  private facultySubjectSections: Map<string, number> = new Map()

  // Lecture-lab pairing: ensures the lab and its corresponding lecture use the same faculty.
  // lectureLabPairs: labSubjectId → lectureSubjectId
  // lectureToLabMap: lectureSubjectId → labSubjectId (reverse lookup)
  private lectureLabPairs: Map<string, string> = new Map()
  private lectureToLabMap: Map<string, string> = new Map()
  // Tracks which faculty is assigned to each (subjectId__sectionId[__set]) key.
  // Used to enforce lecture-lab same-faculty and set-A/set-B same-faculty constraints.
  private assignedFacultyMap: Map<string, string> = new Map()

  private startTime = 0
  private candidateChecks = 0

  // True when at least one laboratory room carries no specialization. Governs how
  // strictly a SPECIALIZED room is reserved — see checkLabSpecialization.
  private hasUnspecializedLab = false

  constructor(
    private subjects: SubjectInput[],
    private faculty: FacultyInput[],
    private rooms: RoomInput[],
    private sections: SectionInput[],
    constraints: Partial<ScheduleConstraints> = {},
    private lockedEntries: LockedEntry[] = []
  ) {
    this.constraints = { ...DEFAULT_CONSTRAINTS, ...constraints }

    this.subjectMap = new Map(subjects.map(s => [s.id, s]))
    this.facultyMap = new Map(faculty.map(f => [f.id, f]))
    this.roomMap = new Map(rooms.map(r => [r.id, r]))
    this.hasUnspecializedLab = rooms.some(
      r => LAB_ROOM_TYPES.has(r.type) && !r.labSpecialization
    )
    this.buildLectureLabPairs()

    this.tasks = this.buildTasks()
    // For large runs (GEC/PATHFIT across all sections), use a tight per-task limit so
    // candidate enumeration is O(tasks × earlyStopLimit) instead of O(tasks × 50K+).
    const candidateLimit = this.tasks.length > GREEDY_ONLY_THRESHOLD
      ? MAX_CANDIDATES_GREEDY
      : MAX_CANDIDATES_PER_TASK
    this.taskCandidates = this.initializeCandidates(candidateLimit)
  }

  // Pre-populate slot maps with entries that must be treated as already-occupied.
  // Called after every slot-map clear in generate() so locked slots survive resets.
  private preloadLockedSlots(): void {
    for (const entry of this.lockedEntries) {
      const startMin = this.toMinutes(entry.startTime)
      const endMin   = this.toMinutes(entry.endTime)
      this.addSlots(this.facultySlots, entry.facultyId, entry.day, startMin, endMin)
      this.addSlots(this.roomSlots,    entry.roomId,    entry.day, startMin, endMin)
      // For lab sets: occupy both the per-set key and the whole-section key so lectures
      // know that slot is taken, and other sets see the section is occupied.
      const sectionKey = entry.set ? `${entry.sectionId}|${entry.set}` : entry.sectionId
      this.addSlots(this.sectionSlots, sectionKey, entry.day, startMin, endMin)
      if (entry.set) {
        this.addSlots(this.sectionSlots, entry.sectionId, entry.day, startMin, endMin)
      }
      const dailyKey = `${entry.facultyId}|${entry.day}`
      this.facultyDailyMinutes.set(
        dailyKey,
        (this.facultyDailyMinutes.get(dailyKey) ?? 0) + (endMin - startMin)
      )
    }
  }

  private buildTasks(): SchedulingTask[] {
    const tasks: SchedulingTask[] = []
    const existingYearLevels = new Set(this.sections.map(s => s.yearLevel))

    for (const subject of this.subjects) {
      // Curriculum-map override: when allowedSectionIds is provided, it is the
      // exact pairing (already encodes per-program year + semester placement).
      // An empty array means no section takes this subject this run — skip
      // silently rather than queueing it as unassigned.
      let matchingSections: SectionInput[]
      if (subject.allowedSectionIds != null) {
        if (subject.allowedSectionIds.length === 0) continue
        const allowed = new Set(subject.allowedSectionIds)
        matchingSections = this.sections.filter(s => allowed.has(s.id))
        if (matchingSections.length === 0) continue
      } else {
        // Default: match sections by year level first, then narrow by program:
        //   subject.programId set  → only sections in that specific program
        //   subject.programId null → GEC/shared subject, matches all sections at that year
        const yearMatched = this.sections.filter(s => s.yearLevel === subject.year)
        matchingSections = subject.programId
          ? yearMatched.filter(s => s.programId === subject.programId)
          : yearMatched
      }

      if (matchingSections.length === 0) {
        const hint = existingYearLevels.size > 0
          ? `Available year levels: ${[...existingYearLevels].sort().join(', ')}`
          : 'No sections exist for this program at all'
        this.noSectionSubjects.push({
          subjectId: subject.id,
          subjectCode: subject.code,
          subjectTitle: subject.title,
          sectionId: '',
          sectionName: '—',
          reason: `Subject is tagged Year ${subject.year} but no sections exist for that year. ${hint}. Fix the subject's year field or add sections.`,
        })
        continue
      }
      for (const section of matchingSections) {
        if (subject.type === 'LABORATORY') {
          // Labs: two independent tasks so Set A and Set B get genuinely different slots.
          for (const set of ['A', 'B'] as const) {
            tasks.push({
              taskId: `${subject.id}__${section.id}__${set}`,
              subjectId: subject.id,
              sectionId: section.id,
              subject,
              section,
              set,
            })
          }
        } else {
          tasks.push({
            taskId: `${subject.id}__${section.id}`,
            subjectId: subject.id,
            sectionId: section.id,
            subject,
            section,
          })
        }
      }
    }
    return tasks
  }

  async generate(): Promise<GenerationResult> {
    // Subjects with no matching sections are already in noSectionSubjects.
    // If there are also no schedulable tasks, report everything and return early.
    if (this.tasks.length === 0) {
      if (this.noSectionSubjects.length > 0) {
        return { assignments: [], unassigned: this.noSectionSubjects }
      }
      throw new SchedulingError(
        'No scheduling tasks to process',
        ['No subjects are linked to sections. Ensure subjects have a year field and sections exist for each year level.']
      )
    }

    // Partition tasks into schedulable (have candidates) vs empty-domain (impossible)
    const emptyDomainTasks: SchedulingTask[] = []
    const schedulableTasks: SchedulingTask[] = []

    for (const task of this.tasks) {
      const candidates = this.taskCandidates.get(task.taskId)
      if (!candidates || candidates.length === 0) {
        emptyDomainTasks.push(task)
      } else {
        schedulableTasks.push(task)
      }
    }

    // Build unassigned list — start with subjects that had no sections at all,
    // then add tasks whose constraint domain was empty (no valid faculty/room/time).
    const unassigned: UnassignedTask[] = [
      ...this.noSectionSubjects,
      ...emptyDomainTasks.map(t => ({
        subjectId: t.subjectId,
        subjectCode: t.subject.code,
        subjectTitle: t.subject.title,
        sectionId: t.sectionId,
        sectionName: t.section.name,
        reason: this.diagnoseEmptyDomain(t.subject).join('; '),
      })),
    ]

    if (schedulableTasks.length === 0) {
      return { assignments: [], unassigned }
    }

    const orderedTasks = this.applyMRV(schedulableTasks)

    this.assignments = []
    this.facultySlots.clear()
    this.roomSlots.clear()
    this.sectionSlots.clear()
    this.facultyDailyMinutes.clear()
    this.facultyWeeklyUnits.clear()
    this.facultySubjectSections.clear()
    this.assignedFacultyMap.clear()
    this.preloadLockedSlots()
    this.candidateChecks = 0
    this.startTime = Date.now()
    // Hard overall deadline — greedy must finish within 40 s so the route returns before
    // the 60 s serverless timeout.
    const deadline = this.startTime + 40_000

    // For large scheduling runs (GEC/PATHFIT across many sections), backtracking
    // provably cannot finish before the timeout — skip straight to greedy.
    const useBacktracking = schedulableTasks.length <= GREEDY_ONLY_THRESHOLD

    if (useBacktracking) {
      const success = this.backtrack(orderedTasks, 0)
      if (success) {
        return { assignments: [...this.assignments], unassigned }
      }
      // Backtracking timed out or hit a dead end — reset and fall through to greedy.
      this.assignments = []
      this.facultySlots.clear()
      this.roomSlots.clear()
      this.sectionSlots.clear()
      this.facultyDailyMinutes.clear()
      this.facultyWeeklyUnits.clear()
      this.facultySubjectSections.clear()
      this.preloadLockedSlots()
    }

    const { assigned, unassigned: greedyUnassigned } = this.greedyAssign(orderedTasks, deadline)
    unassigned.push(...greedyUnassigned)

    return { assignments: assigned, unassigned }
  }

  private greedyAssign(tasks: SchedulingTask[], deadline?: number): { assigned: Assignment[], unassigned: UnassignedTask[] } {
    const assigned: Assignment[] = []
    const greedyUnassigned: UnassignedTask[] = []

    for (let i = 0; i < tasks.length; i++) {
      if (deadline && Date.now() > deadline) {
        // Hard time cap reached — mark remaining tasks as unassigned
        for (let j = i; j < tasks.length; j++) {
          const t = tasks[j]
          greedyUnassigned.push({
            subjectId: t.subjectId,
            subjectCode: t.subject.code,
            subjectTitle: t.subject.title,
            sectionId: t.sectionId,
            sectionName: t.section.name,
            reason: 'No conflict-free slot available — manual assignment required',
          })
        }
        break
      }

      const task = tasks[i]
      let candidates = this.taskCandidates.get(task.taskId) ?? []

      // Pre-filter to the expected faculty when a partner (lecture/lab or Set A/B) is placed.
      // If the filter yields results, use them so the constraint is satisfied naturally.
      // Fall back to the full candidate list only when the expected faculty has no slots.
      const expectedFacultyId = this.getExpectedFaculty(task)
      if (expectedFacultyId) {
        const filtered = candidates.filter(c => c.facultyId === expectedFacultyId)
        if (filtered.length > 0) candidates = filtered
      }

      let placed = false

      for (const candidate of candidates) {
        if (this.isConsistentFast(candidate)) {
          this.assign(candidate)
          assigned.push(candidate)
          placed = true
          break
        }
      }

      if (!placed) {
        // Rescue pass: pre-computed candidates were all invalidated by earlier assignments.
        // Search the full space dynamically (early-exit on first valid slot found).
        placed = this.rescueTask(task)
        if (placed) assigned.push(this.assignments[this.assignments.length - 1])
      }

      if (!placed) {
        greedyUnassigned.push({
          subjectId: task.subjectId,
          subjectCode: task.subject.code,
          subjectTitle: task.subject.title,
          sectionId: task.sectionId,
          sectionName: task.section.name,
          reason: 'No conflict-free slot available — manual assignment required',
        })
      }
    }

    return { assigned, unassigned: greedyUnassigned }
  }

  // Dynamic fallback for tasks whose pre-computed candidates were all invalidated.
  // Iterates faculty × rooms × patterns × starts and stops at the first valid slot.
  private rescueTask(task: SchedulingTask): boolean {
    const { subject, section } = task
    const expectedFacultyId = this.getExpectedFaculty(task)
    // Same hard specialization constraint as initializeCandidates — this dynamic
    // fallback path must not bypass it (that was the corruption source: mismatched
    // rescue assignments getting synced back into Faculty.specializations as real).
    const isGecSubject = subject.programId === null
    const allAvail = this.faculty.filter(f =>
      f.availability.length > 0 && (isGecSubject || this.matchesSpecialization(f, subject))
    )
    // Restrict rescue to the expected faculty when a partner is already placed.
    // Fall back to the full pool only when the expected faculty truly has no slots.
    const allAvailFaculty = expectedFacultyId
      ? (allAvail.filter(f => f.id === expectedFacultyId).length > 0
          ? allAvail.filter(f => f.id === expectedFacultyId)
          : shuffleInPlace(allAvail))
      : shuffleInPlace(allAvail)
    const patterns = shuffleInPlace(this.getPatternsForTask(subject, section))
    const compatibleRooms = this.rooms.filter(r =>
      this.checkLabSpecialization(subject.id, r.id) &&
      this.roomTypeCompatible(r, subject) &&
      this.roomAllowedForSection(r, section)
    )

    for (const fac of allAvailFaculty) {
      const reachableRooms = shuffleInPlace(
        compatibleRooms.filter(r => this.checkBuildingAvailability(fac.id, r.id))
      )
      for (const room of reachableRooms) {
        for (const pattern of patterns) {
          const { days, minutesEach } = pattern
          const commonStarts = this.getCommonAvailableTimes(fac, days, minutesEach)
          for (const startMin of commonStarts) {
            const candidate: Assignment = {
              subjectId: subject.id,
              facultyId: fac.id,
              roomId: room.id,
              sectionId: section.id,
              day: days[0],
              startTime: this.fromMinutes(startMin),
              endTime: this.fromMinutes(startMin + minutesEach),
              extraSessions: days.slice(1).map(d => ({
                day: d,
                startTime: this.fromMinutes(startMin),
                endTime: this.fromMinutes(startMin + minutesEach),
              })),
              ...(task.set !== undefined ? { set: task.set } : {}),
            }
            if (this.isConsistentFast(candidate)) {
              this.assign(candidate)
              return true
            }
          }
        }
      }
    }
    return false
  }

  // ── Hard Constraint Checks ────────────────────────────────────────────────
  //
  // Both checks are applied at initializeCandidates() time so invalid
  // (faculty, room) pairs are pruned BEFORE backtracking begins. This is the
  // critical optimization: the search tree never visits branches that violate
  // these hard constraints. They are also re-checked in isConsistentFast as
  // a safety net for any runtime state that may have changed.

  /**
   * Hard Constraint 1 — Building Availability
   * Returns true if the faculty member is permitted to teach in the building
   * that contains this room for the current semester.
   *
   * Evaluation order rationale: checked FIRST because it eliminates the largest
   * number of (faculty × room) pairs before we even consider timeslots. A single
   * faculty member restricted to one building eliminates all rooms in all other
   * buildings in O(1) per candidate.
   */
  private checkBuildingAvailability(facultyId: string, roomId: string): boolean {
    if (!this.constraints.enforceBuildingAvailability) return true

    const faculty = this.facultyMap.get(facultyId)
    const room = this.roomMap.get(roomId)
    if (!faculty || !room) return false

    // No restrictions recorded for this faculty — allow all buildings (legacy fallback).
    if (faculty.allowedBuildingIds.length === 0) return true

    return faculty.allowedBuildingIds.includes(room.buildingId)
  }

  /**
   * Hard Constraint 2 — Lab Specialization
   * Returns true if the room's specialization satisfies the subject's requirement.
   *
   * Evaluation order rationale: checked SECOND. After building pruning, this
   * eliminates mismatched room types within valid buildings, keeping only rooms
   * that serve the exact academic category (e.g., Cisco Networking Lab for a
   * Cisco-tagged subject). Subjects without a requiredLabSpecialization pass
   * automatically, so lecture courses are unaffected.
   */
  /**
   * Hard Constraint — Laboratory specialization, enforced in BOTH directions.
   *
   * Forward: a subject that names a required specialization may only be placed in
   * a room carrying exactly that specialization.
   *
   * Reverse: a specialized room is reserved for the subjects that actually need
   * it. Previously only the forward rule existed, so a subject with no
   * specialization requirement could be dropped into the computer lab while a
   * general laboratory sat empty — the room read as "a lab" and nothing more.
   *
   * The reverse rule is relaxed automatically when no unspecialized laboratory
   * exists in the pool: if every lab is specialized, reserving them all would
   * leave general lab subjects with an empty domain and push them straight to the
   * Unassigned Queue, which is worse than an imperfect room.
   */
  private checkLabSpecialization(subjectId: string, roomId: string): boolean {
    if (!this.constraints.enforceLabSpecialization) return true

    const subject = this.subjectMap.get(subjectId)
    const room = this.roomMap.get(roomId)
    if (!subject || !room) return false

    if (subject.requiredLabSpecialization) {
      return room.labSpecialization === subject.requiredLabSpecialization
    }

    if (room.labSpecialization && this.hasUnspecializedLab) return false

    return true
  }

  // ── Candidate Initialization ─────────────────────────────────────────────

  /**
   * Pre-compute all valid (faculty, room, day, startTime, endTime) tuples per task.
   * Hard constraints are applied here to prune the search space before backtracking.
   * Constraint evaluation order:
   *   1. checkLabSpecialization   — most targeted, eliminates wrong room specializations
   *   2. checkBuildingAvailability — eliminates rooms in forbidden buildings per faculty
   *   3. roomCompatible (type)    — eliminates wrong room categories
   *   4. matchesSpecialization    — eliminates faculty without subject knowledge
   *   5. timeslot windows         — eliminates slots outside faculty availability
   */
  private initializeCandidates(maxPerTask = MAX_CANDIDATES_PER_TASK): Map<string, Assignment[]> {
    const candidates = new Map<string, Assignment[]>()

    for (const task of this.tasks) {
      const { subject, section } = task
      const possible: Assignment[] = []

      // Specialization is a HARD constraint for major subjects: a task with no
      // specialization-matched faculty produces no candidates and falls through to
      // the unassigned queue for manual assignment, rather than being silently
      // filled by a mismatched faculty member. GEC/GEL subjects are exempt — they're
      // generalist and not tied to a program's specialization pool.
      const isGecSubject = subject.programId === null
      const allAvailFaculty = this.faculty.filter(f => f.availability.length > 0)
      const eligibleFaculty = isGecSubject
        ? allAvailFaculty
        : allAvailFaculty.filter(f => this.matchesSpecialization(f, subject))

      const compatibleRooms = this.rooms.filter(r =>
        this.checkLabSpecialization(subject.id, r.id) &&
        this.roomTypeCompatible(r, subject) &&
        this.roomAllowedForSection(r, section)
      )

      // Day-group patterns: labs run as one continuous block on a single day;
      // lectures are distributed across multiple days at the same clock time.
      // Saturday patterns are pruned here unless the task is CAM/NSTP (Hard Constraint).
      const patterns = this.getPatternsForTask(subject, section)

      // Whether to stop as soon as we hit maxPerTask (greedy-only runs don't need diversity).
      const earlyStop = maxPerTask < MAX_CANDIDATES_PER_TASK

      // For greedy runs, shuffle faculty and patterns before collection so the
      // early-stop cap yields diverse candidates across different faculty members
      // and days — not 20 picks all from the first faculty member's Monday slots.
      const sampledFaculty = earlyStop ? shuffleInPlace([...eligibleFaculty]) : eligibleFaculty
      const sampledPatterns = earlyStop ? shuffleInPlace([...patterns]) : patterns

      outer: for (const fac of sampledFaculty) {
        const reachableRooms = compatibleRooms.filter(r =>
          this.checkBuildingAvailability(fac.id, r.id)
        )
        const sampledRooms = earlyStop ? shuffleInPlace([...reachableRooms]) : reachableRooms

        for (const room of sampledRooms) {
          for (const pattern of sampledPatterns) {
            const { days, minutesEach } = pattern
            // Times where faculty has coverage [t, t+minutesEach] on EVERY day in the group.
            const commonStarts = this.getCommonAvailableTimes(fac, days, minutesEach)

            for (const startMin of commonStarts) {
              const endMin = startMin + minutesEach
              possible.push({
                subjectId: subject.id,
                facultyId: fac.id,
                roomId: room.id,
                sectionId: section.id,
                day: days[0],
                startTime: this.fromMinutes(startMin),
                endTime: this.fromMinutes(endMin),
                extraSessions: days.slice(1).map(d => ({
                  day: d,
                  startTime: this.fromMinutes(startMin),
                  endTime: this.fromMinutes(endMin),
                })),
                ...(task.set !== undefined ? { set: task.set } : {}),
              })
              if (earlyStop && possible.length >= maxPerTask) break outer
            }
          }
        }
      }

      // Shuffle candidates before storing. For backtracking runs this spreads the search
      // space; for greedy the early-stop shuffling above already provides diversity.
      if (possible.length > 1) {
        for (let i = possible.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [possible[i], possible[j]] = [possible[j], possible[i]]
        }
      }
      if (!earlyStop && possible.length > maxPerTask) {
        possible.length = maxPerTask
      }

      candidates.set(task.taskId, possible)
    }

    return candidates
  }

  /**
   * Hard Constraint — Program (Course) Room Access
   * A room with allowedProgramIds set may only host sections belonging to one
   * of those programs. Rooms without the restriction are open to all sections.
   */
  private roomAllowedForSection(room: RoomInput, section: SectionInput): boolean {
    if (!room.allowedProgramIds || room.allowedProgramIds.length === 0) return true
    return section.programId != null && room.allowedProgramIds.includes(section.programId)
  }

  /**
   * Hard Constraint 3 — Saturday Restriction
   * Only CAM (College of Allied Medicine) sections and NSTP subjects may hold
   * Saturday classes. All other tasks are restricted to Monday–Friday patterns.
   */
  private taskAllowsSaturday(subject: SubjectInput, section: SectionInput): boolean {
    if (section.allowSaturday === true) return true
    const code = subject.code.toUpperCase()
    return code.startsWith('NSTP') || code.startsWith('NST')
  }

  // Day patterns valid for this (subject, section) pair — drops Saturday patterns
  // for tasks that are not allowed to run on Saturdays.
  private getPatternsForTask(subject: SubjectInput, section: SectionInput): { days: DayOfWeek[]; minutesEach: number }[] {
    const patterns = this.getSessionDayGroups(subject)
    if (this.taskAllowsSaturday(subject, section)) return patterns
    return patterns.filter(p => !p.days.includes('SATURDAY'))
  }

  private getSessionDayGroups(subject: SubjectInput): { days: DayOfWeek[]; minutesEach: number }[] {
    const allDays: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    const h = Math.max(1, subject.hoursPerWeek ?? 1)

    if (subject.type === 'LABORATORY') {
      // Labs: single continuous block on any one day (never split)
      const mins = Math.max(60, h * 60)
      return allDays.map(d => ({ days: [d], minutesEach: mins }))
    }

    // Multi-day distribution patterns (preferred: spreads the teaching load)
    const distributedPatterns = SESSION_DAY_GROUPS[Math.min(h, 3)] ?? [
      // 4+ hours: split into 2 equal sessions
      { days: ['MONDAY', 'THURSDAY'] as DayOfWeek[], minutesEach: Math.ceil(h / 2) * 60 },
      { days: ['TUESDAY', 'FRIDAY']  as DayOfWeek[], minutesEach: Math.ceil(h / 2) * 60 },
    ]

    // Single-session fallback: full block on one day.
    // Used when faculty don't have availability at the same clock-time on multiple days.
    const totalMins = Math.max(60, h * 60)
    const singleSessionPatterns = allDays.map(d => ({ days: [d] as DayOfWeek[], minutesEach: totalMins }))

    // Return distributed first (preferred), single-session last (fallback)
    return [...distributedPatterns, ...singleSessionPatterns]
  }

  // Returns all start-minute values where faculty has an availability window covering
  // [t, t+minutesEach] on EVERY day in the group at the same clock time.
  private getCommonAvailableTimes(fac: FacultyInput, days: DayOfWeek[], minutesEach: number): number[] {
    const anchors = new Set<number>()
    for (const w of fac.availability.filter(a => a.day === days[0])) {
      const wStart = this.toMinutes(w.startTime)
      const wEnd = this.toMinutes(w.endTime)
      for (let t = wStart; t + minutesEach <= wEnd; t += 30) {
        anchors.add(t)
      }
    }
    if (days.length === 1) return [...anchors]
    return [...anchors].filter(t =>
      days.slice(1).every(day =>
        fac.availability
          .filter(a => a.day === day)
          .some(w => this.toMinutes(w.startTime) <= t && this.toMinutes(w.endTime) >= t + minutesEach)
      )
    )
  }

  // Returns the faculty ID that a task MUST use to satisfy same-faculty constraints,
  // or null if no partner has been assigned yet (no constraint applies).
  private getExpectedFaculty(task: SchedulingTask): string | null {
    const { subjectId, sectionId, set } = task
    if (set === 'B') return this.assignedFacultyMap.get(`${subjectId}__${sectionId}__A`) ?? null
    if (set === 'A') return this.assignedFacultyMap.get(`${subjectId}__${sectionId}__B`) ?? null
    // Lecture: check if the paired lab is already placed
    const pairedLabId = this.lectureToLabMap.get(subjectId)
    if (pairedLabId) {
      return this.assignedFacultyMap.get(`${pairedLabId}__${sectionId}__A`)
        ?? this.assignedFacultyMap.get(`${pairedLabId}__${sectionId}__B`)
        ?? null
    }
    // Lab with no set (safety): check if the paired lecture is already placed
    const pairedLectureId = this.lectureLabPairs.get(subjectId)
    if (pairedLectureId) {
      return this.assignedFacultyMap.get(`${pairedLectureId}__${sectionId}`) ?? null
    }
    return null
  }

  // ── Compatibility Helpers ─────────────────────────────────────────────────

  /**
   * Builds the lecture ↔ lab pairing maps used by the same-faculty constraint.
   * Matching rules (both must satisfy the same year level):
   *   Code: lab code = lecture code + "L" suffix (case-insensitive)
   *   Title: lab title without " Laboratory" / " Lab" suffix equals lecture title
   * When multiple lectures match, the one with the longest code wins (most specific).
   */
  private buildLectureLabPairs(): void {
    const lectures = this.subjects.filter(s => s.type === 'LECTURE')
    const labs     = this.subjects.filter(s => s.type === 'LABORATORY')

    for (const lab of labs) {
      const labCode  = lab.code.toLowerCase()
      const labTitle = lab.title.toLowerCase().replace(/\s*(laboratory|lab)\s*$/i, '').trim()

      let bestMatch: SubjectInput | undefined

      for (const lec of lectures) {
        if (lec.year !== lab.year) continue
        const lecCode  = lec.code.toLowerCase()
        const lecTitle = lec.title.toLowerCase().trim()

        const codeMatch  = labCode === lecCode + 'l' || labCode.startsWith(lecCode + 'l')
        const titleMatch = labTitle === lecTitle || labTitle.startsWith(lecTitle)

        if (codeMatch || titleMatch) {
          if (!bestMatch || lec.code.length > bestMatch.code.length) {
            bestMatch = lec
          }
        }
      }

      if (bestMatch) {
        this.lectureLabPairs.set(lab.id, bestMatch.id)
        this.lectureToLabMap.set(bestMatch.id, lab.id)
      }
    }
  }

  private matchesSpecialization(faculty: FacultyInput, subject: SubjectInput): boolean {
    // Strict (Section 7 / Bug 3): a faculty member with NO specializations set is not
    // eligible to teach a major subject — they surface in the unassigned queue so the
    // chair knows to set their specializations, rather than being matched to anything.
    // (GEC/GEL subjects never reach this check — they're generalist and exempt at every
    // call site via the isGecSubject guard.)
    if (faculty.specializations.length === 0) return false
    const titleLower = (subject.title?.toLowerCase() ?? '').trim()
    return faculty.specializations.some(sp => {
      const spLower = sp.toLowerCase().trim()
      return spLower === titleLower || titleLower.includes(spLower) || spLower.includes(titleLower)
    })
  }

  // Checks room type compatibility only (not lab specialization — that's a separate constraint).
  private roomTypeCompatible(room: RoomInput, subject: SubjectInput): boolean {
    if (subject.requiredRoomType.length > 0 && !subject.requiredRoomType.includes(room.type)) {
      return false
    }
    return true
  }

  private diagnoseEmptyDomain(subject: SubjectInput): string[] {
    const reasons: string[] = []
    // For diagnostic messaging: use the shortest session this subject generates
    // (e.g. a 3h lecture can be split 1h×3 or 1.5h×2, so minimum is 60 min)
    const patterns = this.getSessionDayGroups(subject)
    const sessionMinutes = patterns.reduce((min, p) => Math.min(min, p.minutesEach), Infinity)

    const facultyWithAvailability = this.faculty.filter(f => f.availability.length > 0)
    if (facultyWithAvailability.length === 0) {
      reasons.push(
        `No faculty have availability set for this semester — go to Faculty Availability and add time slots for at least one faculty member`
      )
      return reasons
    }

    // Specialization is a hard constraint for major (non-GEC) subjects — check this
    // before room/building checks since it's the most common reason a task lands
    // in the unassigned queue.
    if (subject.programId !== null) {
      // Check specialization across ALL faculty, not just those with availability.
      // Filtering by availability first made this report "no faculty with a matching
      // specialization" for a subject whose specialist merely had no availability rows
      // for this semester — blaming the wrong field and sending the chair to the wrong
      // page to fix it. Separate the two causes so the message names the real one.
      const specialists = this.faculty.filter(f => this.matchesSpecialization(f, subject))
      if (specialists.length === 0) {
        reasons.push(
          `No faculty with a matching specialization for "${subject.title}" — add this subject to a faculty member's specializations on the Faculty page, or manually assign an entry`
        )
        return reasons
      }
      const specialistsAvailable = specialists.filter(f => f.availability.length > 0)
      if (specialistsAvailable.length === 0) {
        const names = specialists.slice(0, 3).map(f => f.name).join(", ")
        const more = specialists.length > 3 ? `, +${specialists.length - 3} more` : ""
        reasons.push(
          `${specialists.length} faculty specialize in "${subject.title}" (${names}${more}) but none has availability set for this semester — add their time slots on the Faculty Availability page`
        )
        return reasons
      }
    }

    // Room checks first — these are data-config issues independent of faculty
    const typeCompatible = this.rooms.filter(r => this.roomTypeCompatible(r, subject))
    if (typeCompatible.length === 0) {
      const needed = subject.requiredRoomType.length > 0
        ? subject.requiredRoomType.join(' or ')
        : 'LECTURE_ROOM'
      reasons.push(
        `No active rooms of type "${needed}" exist — add a room of that type in Buildings & Rooms`
      )
    } else if (subject.requiredLabSpecialization) {
      const specCompatible = typeCompatible.filter(r =>
        r.labSpecialization === subject.requiredLabSpecialization
      )
      if (specCompatible.length === 0) {
        reasons.push(
          `No lab with specialization "${subject.requiredLabSpecialization}" exists — add or configure a room with that specialization`
        )
      }
    } else if (subject.type === 'LABORATORY' && this.hasUnspecializedLab) {
      // Reverse specialization rule (see checkLabSpecialization): specialized labs
      // are reserved, so this subject can only use the general ones.
      const generalLabs = typeCompatible.filter(r => !r.labSpecialization)
      if (generalLabs.length === 0) {
        reasons.push(
          `Every compatible laboratory is reserved for a specialization — set a required lab specialization on "${subject.code}" so it can claim the matching room, or add a general laboratory`
        )
      }
    }

    // Faculty → building → room reachability
    const reachableRooms = this.rooms.filter(r =>
      this.checkLabSpecialization(subject.id, r.id) && this.roomTypeCompatible(r, subject)
    )
    if (reachableRooms.length > 0) {
      const anyReachable = facultyWithAvailability.some(f =>
        reachableRooms.some(r => this.checkBuildingAvailability(f.id, r.id))
      )
      if (!anyReachable) {
        reasons.push(
          `No faculty have building availability that covers a room suitable for "${subject.code}" — set building availability for faculty in the Faculty Availability page`
        )
      }
    }

    // Availability window length check
    const windowTooShort = facultyWithAvailability.every(f =>
      f.availability.every(a => {
        const windowMin = this.toMinutes(a.endTime) - this.toMinutes(a.startTime)
        return windowMin < sessionMinutes
      })
    )
    if (windowTooShort && reasons.length === 0) {
      reasons.push(
        `All faculty availability windows are shorter than the ${sessionMinutes / 60}h session this subject requires — extend at least one faculty member's availability window`
      )
    }

    if (reasons.length === 0) {
      reasons.push(
        `No conflict-free combination of faculty, room, and time slot could be found for "${subject.code}" — check that faculty are active, have availability set, and rooms of the right type exist`
      )
    }

    return reasons
  }

  // ── Slot-Based Conflict Detection ─────────────────────────────────────────

  private hasSlotConflict(
    slots: Map<string, boolean>,
    id: string,
    day: string,
    startMin: number,
    endMin: number
  ): boolean {
    for (let t = startMin; t < endMin; t += 30) {
      if (slots.has(`${id}|${day}|${t}`)) return true
    }
    return false
  }

  private addSlots(
    slots: Map<string, boolean>,
    id: string,
    day: string,
    startMin: number,
    endMin: number
  ): void {
    for (let t = startMin; t < endMin; t += 30) {
      slots.set(`${id}|${day}|${t}`, true)
    }
  }

  private removeSlots(
    slots: Map<string, boolean>,
    id: string,
    day: string,
    startMin: number,
    endMin: number
  ): void {
    for (let t = startMin; t < endMin; t += 30) {
      slots.delete(`${id}|${day}|${t}`)
    }
  }

  // ── Backtracking ──────────────────────────────────────────────────────────

  private backtrack(tasks: SchedulingTask[], index: number): boolean {
    if (index === tasks.length) return true

    if ((Date.now() - this.startTime) > MAX_BACKTRACK_MS) return false

    const task = tasks[index]
    const candidates = this.taskCandidates.get(task.taskId) ?? []
    const ordered = this.applyLCV(candidates)

    for (const candidate of ordered) {
      this.candidateChecks++
      if (this.candidateChecks % TIMEOUT_CHECK_INTERVAL === 0) {
        if ((Date.now() - this.startTime) > MAX_BACKTRACK_MS) return false
      }

      if (this.isConsistentFast(candidate)) {
        this.assign(candidate)
        if (this.backtrack(tasks, index + 1)) return true
        this.unassign(candidate)
      }
    }

    return false
  }

  /**
   * Fast consistency check using pre-built slot maps.
   * Hard constraints (building, lab specialization) were already applied at
   * initializeCandidates time, so these checks are O(1) safety nets only.
   * The expensive O(n) checks (overlap scans) were replaced by slot maps.
   */
  private isConsistentFast(candidate: Assignment): boolean {
    // Hard constraints — safety-net re-checks (already applied at candidate generation time)
    if (!this.checkBuildingAvailability(candidate.facultyId, candidate.roomId)) return false
    if (!this.checkLabSpecialization(candidate.subjectId, candidate.roomId)) return false

    // Collect all sessions (primary + extra) for unified overlap and load checks
    const allSessions = [
      { day: candidate.day, start: this.toMinutes(candidate.startTime), end: this.toMinutes(candidate.endTime) },
      ...candidate.extraSessions.map(s => ({
        day: s.day, start: this.toMinutes(s.startTime), end: this.toMinutes(s.endTime),
      })),
    ]

    for (const session of allSessions) {
      if (this.constraints.noFacultyOverlap &&
          this.hasSlotConflict(this.facultySlots, candidate.facultyId, session.day, session.start, session.end)) {
        return false
      }
      if (this.constraints.noRoomOverlap &&
          this.hasSlotConflict(this.roomSlots, candidate.roomId, session.day, session.start, session.end)) {
        return false
      }
      if (this.constraints.noSectionOverlap) {
        if (candidate.set) {
          // Lab set: check per-set key (A/B don't block each other) + whole-section key (lectures block labs)
          if (this.hasSlotConflict(this.sectionSlots, `${candidate.sectionId}|${candidate.set}`, session.day, session.start, session.end)) return false
          if (this.hasSlotConflict(this.sectionSlots, candidate.sectionId, session.day, session.start, session.end)) return false
        } else {
          // Lecture: blocks the whole section — check whole-section key AND both lab-set keys
          if (this.hasSlotConflict(this.sectionSlots, candidate.sectionId, session.day, session.start, session.end)) return false
          if (this.hasSlotConflict(this.sectionSlots, `${candidate.sectionId}|A`, session.day, session.start, session.end)) return false
          if (this.hasSlotConflict(this.sectionSlots, `${candidate.sectionId}|B`, session.day, session.start, session.end)) return false
        }
      }
      // Daily load check per session day
      const dailyKey = `${candidate.facultyId}|${session.day}`
      const currentDailyMin = this.facultyDailyMinutes.get(dailyKey) ?? 0
      if ((currentDailyMin + (session.end - session.start)) / 60 > this.constraints.maxDailyLoad) return false
    }

    // Weekly units and section limits are per-assignment (checked once, not per session)
    const subject = this.subjectMap.get(candidate.subjectId)
    if (subject) {
      const currentUnits = this.facultyWeeklyUnits.get(candidate.facultyId) ?? 0
      // Honour the per-faculty cap the chair sets on the Faculty page
      // (Faculty.maxUnitsPerWeek, shown there as "Teaching Load x / Nu"),
      // bounded by the engine-wide ceiling. Previously FacultyInput.maxUnitsPerWeek
      // was collected and passed in but never read — every faculty was silently
      // held to the global 30 instead of their own limit.
      const facUnitCap = this.facultyMap.get(candidate.facultyId)?.maxUnitsPerWeek
      const effectiveMaxUnits = Math.min(
        facUnitCap && facUnitCap > 0 ? facUnitCap : this.constraints.maxWeeklyUnits,
        this.constraints.maxWeeklyUnits
      )
      if (currentUnits + subject.units > effectiveMaxUnits) return false

      const fac = this.facultyMap.get(candidate.facultyId)
      if (fac?.sectionCounts && Object.keys(fac.sectionCounts).length > 0) {
        const maxSec = fac.sectionCounts[subject.title]
        if (maxSec !== undefined && maxSec > 0) {
          const fsKey = `${candidate.facultyId}|${subject.title}`
          if ((this.facultySubjectSections.get(fsKey) ?? 0) >= maxSec) return false
        }
      }

      if (this.constraints.noBackToBackLab && subject.type === 'LABORATORY') {
        const s0 = allSessions[0]
        if (this.hasBackToBackLabFast(candidate, s0.start, s0.end)) return false
      }

      // Same-faculty preference: enforced as a soft constraint via pre-filtering in
      // greedyAssign/rescueTask (see getExpectedFaculty). Not a hard block here because
      // when the lecture faculty has no remaining lab slots the lab would become unassigned.
      // The pre-filter already tries the matched faculty first; if that fails the full
      // faculty pool is used as a fallback.
    }

    return true
  }

  private hasBackToBackLabFast(
    candidate: Assignment,
    candidateStart: number,
    candidateEnd: number
  ): boolean {
    return this.assignments.some(a => {
      if (a.day !== candidate.day) return false
      const otherSubject = this.subjectMap.get(a.subjectId)
      if (!otherSubject || otherSubject.type !== 'LABORATORY') return false
      if (a.facultyId !== candidate.facultyId && a.sectionId !== candidate.sectionId) return false
      // Different lab sets (A vs B) are independent student groups — back-to-back is allowed.
      if (a.sectionId === candidate.sectionId && a.set !== candidate.set) return false
      const aStart = this.toMinutes(a.startTime)
      const aEnd = this.toMinutes(a.endTime)
      return aEnd === candidateStart || candidateEnd === aStart
    })
  }

  private assign(a: Assignment): void {
    this.assignments.push(a)
    const allSessions = [
      { day: a.day, start: this.toMinutes(a.startTime), end: this.toMinutes(a.endTime) },
      ...a.extraSessions.map(s => ({ day: s.day, start: this.toMinutes(s.startTime), end: this.toMinutes(s.endTime) })),
    ]
    const sectionKey = a.set ? `${a.sectionId}|${a.set}` : a.sectionId
    for (const session of allSessions) {
      this.addSlots(this.facultySlots, a.facultyId, session.day, session.start, session.end)
      this.addSlots(this.roomSlots, a.roomId, session.day, session.start, session.end)
      this.addSlots(this.sectionSlots, sectionKey, session.day, session.start, session.end)
      const dailyKey = `${a.facultyId}|${session.day}`
      this.facultyDailyMinutes.set(dailyKey, (this.facultyDailyMinutes.get(dailyKey) ?? 0) + (session.end - session.start))
    }
    // Units and section counts are per-assignment, not per-session
    const subject = this.subjectMap.get(a.subjectId)
    if (subject) {
      this.facultyWeeklyUnits.set(a.facultyId, (this.facultyWeeklyUnits.get(a.facultyId) ?? 0) + subject.units)
      const fsKey = `${a.facultyId}|${subject.title}`
      this.facultySubjectSections.set(fsKey, (this.facultySubjectSections.get(fsKey) ?? 0) + 1)
    }
    // Track faculty per (subject, section, set?) for lecture-lab pairing constraint
    const pairKey = a.set
      ? `${a.subjectId}__${a.sectionId}__${a.set}`
      : `${a.subjectId}__${a.sectionId}`
    this.assignedFacultyMap.set(pairKey, a.facultyId)
  }

  private unassign(a: Assignment): void {
    this.assignments.pop()
    const allSessions = [
      { day: a.day, start: this.toMinutes(a.startTime), end: this.toMinutes(a.endTime) },
      ...a.extraSessions.map(s => ({ day: s.day, start: this.toMinutes(s.startTime), end: this.toMinutes(s.endTime) })),
    ]
    const sectionKey = a.set ? `${a.sectionId}|${a.set}` : a.sectionId
    for (const session of allSessions) {
      this.removeSlots(this.facultySlots, a.facultyId, session.day, session.start, session.end)
      this.removeSlots(this.roomSlots, a.roomId, session.day, session.start, session.end)
      this.removeSlots(this.sectionSlots, sectionKey, session.day, session.start, session.end)
      const dailyKey = `${a.facultyId}|${session.day}`
      const newDaily = (this.facultyDailyMinutes.get(dailyKey) ?? 0) - (session.end - session.start)
      if (newDaily <= 0) this.facultyDailyMinutes.delete(dailyKey)
      else this.facultyDailyMinutes.set(dailyKey, newDaily)
    }
    const subject = this.subjectMap.get(a.subjectId)
    if (subject) {
      const newUnits = (this.facultyWeeklyUnits.get(a.facultyId) ?? 0) - subject.units
      if (newUnits <= 0) this.facultyWeeklyUnits.delete(a.facultyId)
      else this.facultyWeeklyUnits.set(a.facultyId, newUnits)
      const fsKey = `${a.facultyId}|${subject.title}`
      const prevSec = this.facultySubjectSections.get(fsKey) ?? 0
      if (prevSec <= 1) this.facultySubjectSections.delete(fsKey)
      else this.facultySubjectSections.set(fsKey, prevSec - 1)
    }
    // Un-track faculty assignment for lecture-lab pairing constraint
    const pairKey = a.set
      ? `${a.subjectId}__${a.sectionId}__${a.set}`
      : `${a.subjectId}__${a.sectionId}`
    this.assignedFacultyMap.delete(pairKey)
  }

  // ── Heuristics ────────────────────────────────────────────────────────────

  private applyMRV(tasks: SchedulingTask[]): SchedulingTask[] {
    return [...tasks].sort((a, b) => {
      const domainA = this.taskCandidates.get(a.taskId)?.length ?? 0
      const domainB = this.taskCandidates.get(b.taskId)?.length ?? 0
      // Fewer candidates → harder to place → schedule first (classic MRV).
      if (domainA !== domainB) return domainA - domainB

      // Equal domain size: within the same section, keep lecture-lab-set groups ordered
      // (lecture → Set A → Set B) so the anchor task sets the faculty first and the
      // constraint propagates naturally to its partners.
      if (a.sectionId === b.sectionId) {
        if (this.lectureToLabMap.get(a.subjectId) === b.subjectId) return -1
        if (this.lectureToLabMap.get(b.subjectId) === a.subjectId) return 1
        if (a.subjectId === b.subjectId) {
          if (a.set === 'A' && b.set === 'B') return -1
          if (a.set === 'B' && b.set === 'A') return 1
        }
      }

      // Higher-unit tasks are harder to fit; schedule them before lower-unit tasks.
      return b.subject.units - a.subject.units
    })
  }

  private applyLCV(domain: Assignment[]): Assignment[] {
    if (this.constraints.preferMorningSlots) {
      return [...domain].sort((a, b) => this.toMinutes(a.startTime) - this.toMinutes(b.startTime))
    }
    return domain
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }

  private fromMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }
}
