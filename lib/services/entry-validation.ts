// Entry-level constraint validation for POST/PATCH schedule entries
// Enforces the same constraints as the backtracking engine at the API level

import { db } from "@/lib/db"
import { getCurriculumCodes, hasCurriculumMap } from "@/lib/curriculum-map"
import { specializationsCoverSubject } from "@/lib/specialization-match"

interface EntryData {
  subjectId: string
  facultyId: string
  roomId: string
  sectionId: string
  day: string
  startTime: string
  endTime: string
  set?: string | null
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return toMinutes(s1) < toMinutes(e2) && toMinutes(s2) < toMinutes(e1)
}

/**
 * Marker prefix on conflicts that describe a PHYSICAL impossibility — one faculty
 * member or one room occupied twice at the same moment. Unlike the capacity rules
 * (weekly units, daily load), these are not judgment calls a chair may knowingly
 * accept, so `force: true` must not override them. The prefix is stripped before
 * the message reaches the user.
 *
 * Why a marker rather than a structured return: validateEntry returns
 * `string | null` and is called from several routes; threading a new result type
 * through all of them would be a much larger change than this problem warrants.
 */
export const HARD_CONFLICT_PREFIX = "[HARD]"

/** True when this error must block even a force-save. */
export function isHardConflict(message: string | null | undefined): boolean {
  return typeof message === "string" && message.startsWith(HARD_CONFLICT_PREFIX)
}

/** Strips the internal marker so the message can be shown to a user. */
export function stripConflictMarker(message: string): string {
  return message.startsWith(HARD_CONFLICT_PREFIX)
    ? message.slice(HARD_CONFLICT_PREFIX.length).trimStart()
    : message
}

/**
 * " (CIT)" when the conflicting entry lives in another department's schedule,
 * "" when it is in this one (naming your own department adds nothing).
 */
function whereClause(
  currentScheduleId: string,
  conflicting: { scheduleId?: string; schedule?: { department?: { abbreviation?: string | null } | null } | null }
): string {
  if (!conflicting.scheduleId || conflicting.scheduleId === currentScheduleId) return ""
  const abbr = conflicting.schedule?.department?.abbreviation
  return abbr ? ` in the ${abbr} schedule` : " in another department's schedule"
}

/**
 * Validate a schedule entry against all constraints.
 * Returns null if valid, or an error message string if invalid.
 * Checks existing entries in the same schedule to detect overlaps.
 */
export async function validateEntry(
  scheduleId: string,
  entry: EntryData,
  excludeEntryId?: string // exclude this entry from overlap checks (for PATCH)
): Promise<string | null> {
  // 6. Time validation (check first — no DB needed)
  if (toMinutes(entry.startTime) >= toMinutes(entry.endTime)) {
    return "Start time must be before end time"
  }

  // Step 1: Fetch the schedule to get semesterId (needed for cross-schedule checks)
  // and its semester type (needed for the 1st/2nd-semester guard below).
  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    select: { semesterId: true, semester: { select: { type: true } } },
  })

  // Step 2: Parallel fetch using semesterId
  const [sameScheduleEntries, crossScheduleEntries, faculty, subject, section, roomAccess] = await Promise.all([
    // Entries within THIS schedule — used for section-overlap checks
    db.scheduleEntry.findMany({
      where: {
        scheduleId,
        ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      },
      select: {
        scheduleId: true,
        facultyId: true,
        roomId: true,
        sectionId: true,
        day: true,
        startTime: true,
        endTime: true,
        set: true,
        subject: { select: { code: true, type: true } },
        faculty: { select: { user: { select: { firstName: true, lastName: true } } } },
        room: { select: { code: true } },
        section: { select: { name: true } },
        schedule: { select: { department: { select: { abbreviation: true } } } },
      },
    }),
    // ALL entries across non-archived schedules in the same semester —
    // used for room and faculty overlap checks to catch cross-department double-bookings.
    schedule?.semesterId
      ? db.scheduleEntry.findMany({
          where: {
            scheduleId: { not: scheduleId },
            schedule: { semesterId: schedule.semesterId, isArchived: false },
            ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
          },
          select: {
            scheduleId: true,
            facultyId: true,
            roomId: true,
            sectionId: true,
            day: true,
            startTime: true,
            endTime: true,
            set: true,
            subject: { select: { code: true, type: true } },
            faculty: { select: { user: { select: { firstName: true, lastName: true } } } },
            room: { select: { code: true } },
            section: { select: { name: true } },
            schedule: { select: { department: { select: { abbreviation: true } } } },
          },
        })
      : Promise.resolve([]),
    // Faculty — active status, specializations, per-week cap, and the buildings
    // they're available to teach in (engine parity: enforceBuildingAvailability).
    // Building availability is scoped to THIS schedule's semester — same rule the
    // generator uses, so a manual entry can't lean on another semester's rows.
    db.faculty.findUnique({
      where: { id: entry.facultyId },
      select: {
        employeeId: true, // "TBA" identifies the placeholder sentinel — see isTbaFaculty below
        specializations: true,
        isActive: true,
        maxUnitsPerWeek: true,
        buildingAvailability: {
          where: schedule?.semesterId ? { semesterId: schedule.semesterId } : undefined,
          select: { buildingId: true },
        },
        user: { select: { firstName: true, lastName: true, isActive: true } },
      },
    }),
    // Subject info (year/yearLevelId/semester for alignment + semester guard;
    // requiredRoomType, requiredLabSpecialization, units and type for engine parity)
    db.subject.findUnique({
      where: { id: entry.subjectId },
      select: {
        title: true, code: true, year: true, yearLevelId: true, departmentId: true, semester: true,
        requiredRoomType: true, requiredLabSpecialization: true, units: true, type: true,
      },
    }),
    // Section info (include yearLevel + college for alignment and Saturday checks)
    db.section.findUnique({
      where: { id: entry.sectionId },
      select: {
        name: true,
        yearLevelId: true,
        yearLevel: {
          select: {
            level: true,
            program: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
                departmentId: true,
                department: { select: { college: { select: { abbreviation: true } } } },
              },
            },
          },
        },
      },
    }),
    // Room access restrictions (department- and program-level, union semantics),
    // plus type/labSpecialization/buildingId for engine parity.
    db.room.findUnique({
      where: { id: entry.roomId },
      select: {
        code: true,
        type: true,
        labSpecialization: true,
        buildingId: true,
        departments: { select: { departmentId: true } },
        programs: { select: { programId: true } },
      },
    }),
  ])

  // Room/faculty checks use ALL entries (same + other schedules).
  // Section checks use only same-schedule entries (sections appear in one schedule each).
  const allEntries = [...sameScheduleEntries, ...crossScheduleEntries]
  const existingEntries = sameScheduleEntries

  // "TBA" (To Be Announced) sentinel — the placeholder a chair picks to
  // manually resolve an Unassigned Queue item when no real faculty/room is
  // available yet. It's a real Faculty/Room row (seeded once, prisma/seed-tba.ts),
  // identified by these fixed values, so it exists in every normal dropdown —
  // but it must be EXEMPT from the checks that exist to protect a real,
  // scarce resource (specialization, availability, capacity, double-booking):
  // none of those mean anything for a placeholder. Structural checks that
  // don't depend on it being a real resource (section overlap, Saturday
  // restriction, semester/year alignment) still apply as normal.
  const isTbaFaculty = faculty?.employeeId === "TBA"
  const isTbaRoom = roomAccess?.code === "TBA"

  // 0. Inactive faculty check — either Faculty.isActive or User.isActive must be true
  if (faculty && (faculty.isActive === false || faculty.user?.isActive === false)) {
    const fname = faculty.user ? `${faculty.user.firstName} ${faculty.user.lastName}` : "This faculty member"
    return `${fname} is inactive and cannot be assigned to a schedule entry`
  }

  // 0b. Saturday restriction — only CAM (College of Allied Medicine) sections and
  // NSTP subjects may be scheduled on Saturdays (hard constraint, same as engine).
  if (entry.day === "SATURDAY") {
    const subjCode = (subject?.code ?? "").toUpperCase()
    const isNstp = subjCode.startsWith("NSTP") || subjCode.startsWith("NST")
    const collegeAbbr = section?.yearLevel?.program?.department?.college?.abbreviation
    if (!isNstp && collegeAbbr !== "CAM") {
      return `Saturday classes are reserved for CAM (College of Allied Medicine) sections and NSTP subjects. ${section?.name ?? "This section"} cannot be scheduled on Saturday.`
    }
  }

  // 0c. Room access restriction — a room restricted to departments/programs may
  // only host sections whose department OR program (course) is on its list.
  if (roomAccess && (roomAccess.departments.length > 0 || roomAccess.programs.length > 0)) {
    const sectionDeptId = section?.yearLevel?.program?.departmentId
    const sectionProgramId = section?.yearLevel?.program?.id
    const allowed =
      (!!sectionDeptId && roomAccess.departments.some((d) => d.departmentId === sectionDeptId)) ||
      (!!sectionProgramId && roomAccess.programs.some((p) => p.programId === sectionProgramId))
    if (!allowed) {
      return `Room access restriction: ${roomAccess.code} is reserved for specific departments/programs — ${section?.yearLevel?.program?.name ?? "this section's program"} is not allowed to use it.`
    }
  }

  // ── Engine-parity hard constraints (0d–0f) ────────────────────────────────
  // These mirror the backtracking engine's hard constraints so a chair cannot
  // place manually what auto-generation would refuse to place. See
  // lib/services/scheduler.ts — checkLabSpecialization / roomTypeCompatible /
  // checkBuildingAvailability.

  // 0d. Lab specialization — a subject requiring a specialized lab may only use
  // a room whose labSpecialization matches exactly.
  if (subject?.requiredLabSpecialization && roomAccess && !isTbaRoom) {
    if (roomAccess.labSpecialization !== subject.requiredLabSpecialization) {
      const need = String(subject.requiredLabSpecialization).replace(/_/g, " ")
      const has = roomAccess.labSpecialization
        ? String(roomAccess.labSpecialization).replace(/_/g, " ")
        : "no specialization"
      return `Lab specialization mismatch: "${subject.code}" requires a ${need} laboratory, but ${roomAccess.code} has ${has}.`
    }
  }

  // 0e. Room type — a subject that declares requiredRoomType may only use rooms
  // of one of those types.
  if (subject?.requiredRoomType?.length && roomAccess && !isTbaRoom) {
    if (!subject.requiredRoomType.includes(roomAccess.type as any)) {
      const need = subject.requiredRoomType.map((t: string) => t.replace(/_/g, " ")).join(", ")
      return `Room type mismatch: "${subject.code}" requires ${need}, but ${roomAccess.code} is a ${String(roomAccess.type).replace(/_/g, " ")}.`
    }
  }

  // 0f. Faculty building availability — when a faculty member has recorded which
  // buildings they can teach in, the room must be in one of them. No rows = no
  // restriction (same legacy fallback the engine uses).
  if (faculty && roomAccess && !isTbaFaculty && !isTbaRoom && (faculty as any).buildingAvailability?.length > 0) {
    const allowedBuildingIds = (faculty as any).buildingAvailability.map((b: any) => b.buildingId)
    if (!allowedBuildingIds.includes(roomAccess.buildingId)) {
      const fname = faculty.user ? `${faculty.user.firstName} ${faculty.user.lastName}` : "This faculty member"
      return `${fname} is not available to teach in the building that ${roomAccess.code} belongs to. Check their building availability.`
    }
  }

  // 1. Faculty overlap — same faculty, same day, overlapping times (checked
  // globally across all schedules). Exempt for TBA: it's a placeholder, not a
  // real person who can only be in one place — many different unresolved
  // classes legitimately share it at the same time.
  const facultyConflict = !isTbaFaculty && allEntries.find(
    (e) =>
      e.facultyId === entry.facultyId &&
      e.day === entry.day &&
      timesOverlap(e.startTime, e.endTime, entry.startTime, entry.endTime)
  )
  if (facultyConflict) {
    const fname = `${facultyConflict.faculty?.user?.lastName ?? ""}, ${facultyConflict.faculty?.user?.firstName ?? ""}`
    // Name the owning department when the clash is in a DIFFERENT schedule. That
    // schedule may belong to a college this chair cannot open, so without it the
    // block reads as unexplainable — the class it names is nowhere they can see.
    return `${HARD_CONFLICT_PREFIX}Faculty conflict: ${fname} is already assigned to "${facultyConflict.subject?.code}"${whereClause(scheduleId, facultyConflict)} on ${entry.day} (${facultyConflict.startTime}-${facultyConflict.endTime})`
  }

  // 2. Room overlap — same room, same day, overlapping times (checked globally
  // across all schedules). Same TBA exemption as above — not a real, scarce room.
  const roomConflict = !isTbaRoom && allEntries.find(
    (e) =>
      e.roomId === entry.roomId &&
      e.day === entry.day &&
      timesOverlap(e.startTime, e.endTime, entry.startTime, entry.endTime)
  )
  if (roomConflict) {
    return `${HARD_CONFLICT_PREFIX}Room conflict: ${roomConflict.room?.code ?? "Room"} is already booked on ${entry.day} (${roomConflict.startTime}-${roomConflict.endTime}) for "${roomConflict.subject?.code}"${whereClause(scheduleId, roomConflict)}`
  }

  // 3. Section overlap — same section, same day, overlapping times (within schedule only —
  // sections appear in exactly one schedule, so cross-schedule check is unnecessary)
  const sectionConflict = existingEntries.find(
    (e) =>
      e.sectionId === entry.sectionId &&
      e.day === entry.day &&
      timesOverlap(e.startTime, e.endTime, entry.startTime, entry.endTime) &&
      // Skip if both are lab entries with different sets
      !(entry.set && (e as any).set && entry.set !== (e as any).set)
  )
  if (sectionConflict) {
    return `Section conflict: ${sectionConflict.section?.name ?? "Section"} already has "${sectionConflict.subject?.code}" on ${entry.day} (${sectionConflict.startTime}-${sectionConflict.endTime})`
  }

  // 4. Faculty availability — check if faculty is available at this time.
  // Hard requirement: a faculty member with NO availability rows for this
  // semester at all is treated as unavailable, not as "no constraint / anything
  // goes". This mirrors the auto-generation engine (initializeCandidates only
  // considers faculty with availability.length > 0 — see scheduler.ts) — manual
  // entry must not be more permissive than the generator. Previously this block
  // only ran `if (availability.length > 0)`, so a faculty with zero configured
  // availability could be manually placed at any day/time with no warning.
  if (schedule?.semesterId && !isTbaFaculty) {
    // Match on the schedule's semester OR the currently-active one. The Faculty
    // Availability page writes against the ACTIVE semester, which is not
    // necessarily the semester of the schedule being edited — so a strict match
    // made freshly-entered availability invisible here and blocked the entry
    // outright ("no availability set"). The generation route already resolves it
    // this way (availabilitySemesterIds in generate/route.ts); manual entry now
    // uses the same rule so both paths agree.
    const activeSemester = await db.semester.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    const semesterIds = [...new Set([schedule.semesterId, activeSemester?.id].filter(Boolean) as string[])]
    const availability = await db.facultyAvailability.findMany({
      where: {
        facultyId: entry.facultyId,
        semesterId: { in: semesterIds },
      },
    })
    if (availability.length === 0) {
      const fname = faculty?.user ? `${faculty.user.firstName} ${faculty.user.lastName}` : "This faculty member"
      return `${fname} has no availability set for this semester and cannot be scheduled. Add their availability in Faculty Availability first.`
    }
    const dayAvailability = availability.filter((a) => a.day === (entry.day as any))
    const entryStart = toMinutes(entry.startTime)
    const entryEnd = toMinutes(entry.endTime)
    const isAvailable = dayAvailability.some(
      (a) => toMinutes(a.startTime) <= entryStart && toMinutes(a.endTime) >= entryEnd
    )
    if (!isAvailable) {
      return `Faculty is not available on ${entry.day} from ${entry.startTime} to ${entry.endTime}. Check their availability settings.`
    }
  }

  // 5. Specialization check — verify faculty can teach this subject.
  // Engine parity: a faculty member with NO specializations recorded is not a
  // wildcard who can teach anything — the engine's matchesSpecialization()
  // returns false for an empty list, so they are never auto-assigned. Manual
  // entry now refuses them too, instead of silently allowing what generation
  // would never produce.
  if (faculty && subject && !isTbaFaculty && faculty.specializations.length === 0) {
    const fname = faculty.user ? `${faculty.user.firstName} ${faculty.user.lastName}` : "This faculty member"
    return `${fname} has no specializations recorded, so they cannot be assigned to "${subject.code} - ${subject.title}". Add their specializations on the Faculty page first.`
  }
  if (faculty && subject && faculty.specializations.length > 0) {
    // Shared with the Add/Edit Entry pickers — see lib/specialization-match.ts.
    // Previously this used a stricter exact/substring test than the dropdown, so a
    // faculty member the picker offered could still be refused here on save.
    if (!specializationsCoverSubject(faculty.specializations, subject.title)) {
      return `Specialization mismatch: Faculty's specializations (${faculty.specializations.join(", ")}) do not match subject "${subject.code} - ${subject.title}"`
    }
  }

  // 6b. Semester guard (Section 7 / Bug 2) — a subject that belongs to the OTHER
  // semester must not be added to this schedule. This is the server-side chokepoint
  // that stops the 1st/2nd-semester mix-up on manual entry, independent of any UI
  // filtering. Uses the curriculum map (program-aware, authoritative — the same source
  // the Add/Edit dialogs filter with) when the section's program is mapped, else falls
  // back to the subject's own stored semester. Only blocks when a subject is POSITIVELY
  // identified as belonging to the other semester, so legitimate off-curriculum extras
  // in the correct semester are still allowed.
  // Only FIRST/SECOND are guarded — the curriculum map has no SUMMER data, so summer
  // schedules are left unrestricted here rather than risk falsely blocking a valid entry.
  const rawSemType = schedule?.semester?.type
  const scheduleSemType: "FIRST" | "SECOND" | undefined =
    rawSemType === "FIRST" || rawSemType === "SECOND" ? rawSemType : undefined
  if (subject && section && scheduleSemType) {
    const otherSem: "FIRST" | "SECOND" = scheduleSemType === "FIRST" ? "SECOND" : "FIRST"
    const progAbbr = section.yearLevel?.program?.abbreviation
    const secYear = section.yearLevel?.level
    const codeLower = (subject.code ?? "").toLowerCase()
    let belongsToOtherSemester = false

    if (progAbbr && secYear && hasCurriculumMap(progAbbr)) {
      const inThis = getCurriculumCodes(progAbbr, secYear, scheduleSemType).some((c) => c.toLowerCase() === codeLower)
      const inOther = getCurriculumCodes(progAbbr, secYear, otherSem).some((c) => c.toLowerCase() === codeLower)
      if (inOther && !inThis) belongsToOtherSemester = true
    } else if (subject.semester && subject.semester !== scheduleSemType) {
      // Unmapped program — fall back to the subject's own stored semester.
      belongsToOtherSemester = true
    }

    if (belongsToOtherSemester) {
      const thisLabel = scheduleSemType === "FIRST" ? "1st" : "2nd"
      const otherLabel = otherSem === "FIRST" ? "1st" : "2nd"
      return `Semester mismatch: "${subject.code} - ${subject.title}" belongs to the ${otherLabel} semester, but this schedule is for the ${thisLabel} semester.`
    }
  }

  // 7. Subject-Section alignment — verify the subject belongs to the section's program
  if (subject && section) {
    // Check year level match
    if (subject.year && section.yearLevel?.level && subject.year !== section.yearLevel.level) {
      return `Year mismatch: "${subject.code}" is a Year ${subject.year} subject but ${section.name} is Year ${section.yearLevel.level}. Please select a matching section.`
    }

    // If subject is linked to a specific yearLevel, it must match the section's yearLevel
    if (subject.yearLevelId && subject.yearLevelId !== section.yearLevelId) {
      return `Program mismatch: "${subject.code}" is assigned to a specific program year level that doesn't match ${section.name}. Check subject assignment in Courses / Departments.`
    }

    // If subject is NOT a GEC/PATHFIT and not from CAS (which manages shared subjects),
    // it must belong to the same department as the section's program.
    const CAS_DEPT_ID = 'cmmzovtv10009qkvur7tude03'
    const isGEC = subject.code.startsWith("GEC") || subject.code.startsWith("GEL") ||
      subject.code.startsWith("PATHFIT") || subject.code.startsWith("PATHFit") ||
      subject.code.startsWith("NST")
    const isCASSubject = subject.departmentId === CAS_DEPT_ID
    // CAS subjects (GEC, science, arts, etc.) can be assigned to any program
    if (!isGEC && !isCASSubject && !subject.yearLevelId) {
      const sectionDeptId = section.yearLevel?.program?.departmentId
      if (sectionDeptId && subject.departmentId && sectionDeptId !== subject.departmentId) {
        return `Department mismatch: "${subject.code} - ${subject.title}" belongs to a different department than ${section.name} (${section.yearLevel?.program?.name ?? "unknown program"}).`
      }
    }
  }

  return null // All checks passed
}

/**
 * Capacity checks — the SOFT half of engine parity.
 *
 * These mirror the backtracking engine's capacity constraints (maxWeeklyUnits,
 * maxDailyLoad, noBackToBackLab), but unlike the structural rules in
 * validateEntry() they are judgment calls, not correctness errors: a chair may
 * legitimately decide to overload a faculty member. So the routes surface these
 * as an override-able warning (`force: true`) rather than a hard block.
 *
 * Returns a warning message, or null when within capacity.
 */
export async function validateEntryCapacity(
  scheduleId: string,
  entry: EntryData,
  excludeEntryId?: string
): Promise<string | null> {
  const MAX_DAILY_HOURS = 10   // engine DEFAULT_CONSTRAINTS.maxDailyLoad
  const GLOBAL_MAX_WEEKLY_UNITS = 30 // engine DEFAULT_CONSTRAINTS.maxWeeklyUnits

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    select: { semesterId: true },
  })

  const [faculty, subject, facultyEntries] = await Promise.all([
    db.faculty.findUnique({
      where: { id: entry.facultyId },
      select: { employeeId: true, maxUnitsPerWeek: true, user: { select: { firstName: true, lastName: true } } },
    }),
    db.subject.findUnique({
      where: { id: entry.subjectId },
      select: { units: true, code: true, type: true },
    }),
    // Every entry this faculty already holds in the same semester, across all
    // non-archived schedules — matching the engine, which sees the whole load.
    schedule?.semesterId
      ? db.scheduleEntry.findMany({
          where: {
            facultyId: entry.facultyId,
            schedule: { semesterId: schedule.semesterId, isArchived: false },
            ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
          },
          select: {
            subjectId: true, sectionId: true, set: true,
            day: true, startTime: true, endTime: true,
            subject: { select: { units: true, type: true } },
          },
        })
      : Promise.resolve([]),
  ])

  // The "TBA" sentinel has no capacity to protect — it's a placeholder, not a
  // real teaching load. Skip weekly units / daily load / back-to-back entirely.
  if (faculty?.employeeId === "TBA") return null

  const fname = faculty?.user
    ? `${faculty.user.firstName} ${faculty.user.lastName}`.trim()
    : "This faculty member"

  // ── Weekly units ────────────────────────────────────────────────────────
  // Count units once per ASSIGNMENT, not per row: a multi-day (MWF) class is
  // three ScheduleEntry rows sharing one subject+section+set, but a single
  // N-unit teaching assignment. Counting rows would triple-count it.
  const assignmentUnits = new Map<string, number>()
  for (const e of facultyEntries) {
    assignmentUnits.set(`${e.subjectId}__${e.sectionId}__${e.set ?? ""}`, e.subject?.units ?? 0)
  }
  const currentUnits = [...assignmentUnits.values()].reduce((a, b) => a + b, 0)

  // The per-faculty cap the chair sets on the Faculty page, bounded by the
  // engine's global ceiling.
  const effectiveMax = Math.min(faculty?.maxUnitsPerWeek ?? GLOBAL_MAX_WEEKLY_UNITS, GLOBAL_MAX_WEEKLY_UNITS)
  const thisKey = `${entry.subjectId}__${entry.sectionId}__${entry.set ?? ""}`
  // Adding another session to an assignment already counted adds no new units.
  const addedUnits = assignmentUnits.has(thisKey) ? 0 : (subject?.units ?? 0)

  if (currentUnits + addedUnits > effectiveMax) {
    return `${fname} would be at ${currentUnits + addedUnits} units this week, over their ${effectiveMax}-unit limit.`
  }

  // ── Daily load ──────────────────────────────────────────────────────────
  const entryStart = toMinutes(entry.startTime)
  const entryEnd = toMinutes(entry.endTime)
  const sameDayMinutes = facultyEntries
    .filter((e) => e.day === entry.day)
    .reduce((sum, e) => sum + (toMinutes(e.endTime) - toMinutes(e.startTime)), 0)
  const totalDailyMinutes = sameDayMinutes + (entryEnd - entryStart)
  if (totalDailyMinutes / 60 > MAX_DAILY_HOURS) {
    const hrs = (totalDailyMinutes / 60).toFixed(1)
    return `${fname} would teach ${hrs} hours on ${entry.day}, over the ${MAX_DAILY_HOURS}-hour daily limit.`
  }

  // ── Back-to-back laboratories ───────────────────────────────────────────
  // Two labs with no gap between them. Set A and Set B of the SAME section are
  // exempt — they're different student groups, and running them back-to-back in
  // one room is the normal pattern (engine: hasBackToBackLabFast).
  if (subject?.type === "LABORATORY") {
    const adjacentLab = facultyEntries.find((e) => {
      if (e.day !== entry.day) return false
      if (e.subject?.type !== "LABORATORY") return false
      if (e.sectionId === entry.sectionId && (e.set ?? null) !== (entry.set ?? null)) return false
      return toMinutes(e.endTime) === entryStart || entryEnd === toMinutes(e.startTime)
    })
    if (adjacentLab) {
      return `${fname} would teach two laboratories back-to-back on ${entry.day} (${adjacentLab.startTime}-${adjacentLab.endTime} then ${entry.startTime}-${entry.endTime}), with no break between them.`
    }
  }

  return null
}
