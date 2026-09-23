// Entry-level constraint validation for POST/PATCH schedule entries
// Enforces the same constraints as the backtracking engine at the API level

import { db } from "@/lib/db"
import { getCurriculumCodes, hasCurriculumMap } from "@/lib/curriculum-map"
import { specializationsCoverSubject } from "@/lib/specialization-match"
import { isPlaceholderRoomCode, isTbaFacultyEmployeeId } from "@/lib/sentinels"
import { describeRequiredRoomTypes, roomTypeAllowedForSubject } from "@/lib/room-type-rules"
import { resolveMaxMinutesPerDay, formatMinutes } from "@/lib/session-rules"
import { DAY_START_TIME, DAY_END_TIME } from "@/lib/constants"
import { MAX_UNITS_ANY_TYPE, formatFacultyType } from "@/lib/faculty-types"

interface EntryData {
  subjectId: string
  facultyId: string
  roomId: string
  sectionId: string
  day: string
  startTime: string
  endTime: string
  set?: string | null
  // Merged NSTP class this row belongs to (see ScheduleEntry.mergeGroupId).
  // Sibling rows of the same merge group are the SAME class held for several
  // sections at once, so they never count as a faculty/room double-booking.
  mergeGroupId?: string | null
}

/** Normalises the exclude argument (one id, or every row of a group). */
function excludeIds(exclude?: string | string[]): string[] {
  if (!exclude) return []
  return Array.isArray(exclude) ? exclude.filter(Boolean) : [exclude]
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
 * Is this room's building open to the department (union semantics, engine parity)?
 *   - a building with NO department links is shared infrastructure — open to all
 *   - otherwise the building must be linked to the department
 * Placeholder rooms (TBA / GYM) are always allowed.
 * The generator's room query uses exactly this rule; the manual Add/Edit paths
 * and the room picker call this so a room the generator may use can also be
 * chosen (and re-saved) by hand.
 */
export async function roomBuildingOpenToDepartment(
  roomId: string,
  departmentId: string | null | undefined
): Promise<{ ok: boolean; roomCode?: string }> {
  if (!departmentId) return { ok: true }
  const room = await db.room.findUnique({
    where: { id: roomId },
    select: { code: true, buildingId: true, building: { select: { departments: { select: { departmentId: true } } } } },
  })
  if (!room) return { ok: true }
  if (isPlaceholderRoomCode(room.code)) return { ok: true }
  const links = room.building?.departments ?? []
  if (links.length === 0) return { ok: true }
  return { ok: links.some((l) => l.departmentId === departmentId), roomCode: room.code }
}

/**
 * Validate a schedule entry against all constraints.
 * Returns null if valid, or an error message string if invalid.
 * Checks existing entries in the same schedule to detect overlaps.
 */
export async function validateEntry(
  scheduleId: string,
  entry: EntryData,
  // Exclude these rows from overlap checks — the row being PATCHed, or every
  // row of the multi-day / merged group it belongs to.
  excludeEntryId?: string | string[]
): Promise<string | null> {
  // 6. Time validation (check first — no DB needed)
  if (toMinutes(entry.startTime) >= toMinutes(entry.endTime)) {
    return "Start time must be before end time"
  }
  const excluded = excludeIds(excludeEntryId)

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
        ...(excluded.length ? { id: { notIn: excluded } } : {}),
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
        mergeGroupId: true,
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
            ...(excluded.length ? { id: { notIn: excluded } } : {}),
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
            mergeGroupId: true,
            subject: { select: { code: true, type: true } },
            faculty: { select: { user: { select: { firstName: true, lastName: true } } } },
            room: { select: { code: true } },
            section: { select: { name: true } },
            schedule: { select: { department: { select: { abbreviation: true } } } },
          },
        })
      : Promise.resolve([]),
    // Faculty — active status, specializations and per-week cap. (Faculty may
    // teach in any building — the per-term building access list was removed.)
    db.faculty.findUnique({
      where: { id: entry.facultyId },
      select: {
        employeeId: true, // "TBA" identifies the placeholder sentinel — see isTbaFaculty below
        specializations: true,
        isActive: true,
        maxUnitsPerWeek: true,
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
        maxMinutesPerDay: true,
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

  // Placeholder resources (see lib/sentinels.ts) — the "TBA" faculty/room a
  // chair picks to manually resolve an Unassigned Queue item, and the shared
  // "GYM" every PATHFIT class is held in. They are real Faculty/Room rows so
  // they exist in every normal dropdown — but they must be EXEMPT from the
  // checks that exist to protect a real, scarce resource (specialization,
  // availability, capacity, double-booking, room type): none of those mean
  // anything for a placeholder. Structural checks that don't depend on it
  // being a real resource (section overlap, Saturday restriction,
  // semester/year alignment) still apply as normal.
  const isTbaFaculty = isTbaFacultyEmployeeId(faculty?.employeeId)
  const isTbaRoom = isPlaceholderRoomCode(roomAccess?.code)
  // Rows of the same merged NSTP class — the same class, not a double-booking.
  const sameMergedClass = (e: { mergeGroupId?: string | null }) =>
    !!entry.mergeGroupId && e.mergeGroupId === entry.mergeGroupId

  // 0a. Per-day session length (GEC/GEL: 1 hour or 1 hour 30 minutes, set on the
  // Subjects page; lib/session-rules.ts). The generator never offers a longer
  // session, and neither may a hand-placed one — not even with Save Anyway.
  if (subject) {
    const cap = resolveMaxMinutesPerDay(subject)
    const sessionMinutes = toMinutes(entry.endTime) - toMinutes(entry.startTime)
    if (cap !== null && sessionMinutes > cap) {
      return `${HARD_CONFLICT_PREFIX}${subject.code} may run for at most ${formatMinutes(cap)} per day — this session is ${formatMinutes(sessionMinutes)} (${entry.startTime}–${entry.endTime}). Split it across more days, or change the subject's per-day limit on the Subjects page.`
    }
  }

  // 0a2. Operating hours — every class must sit within 7:30 AM-8:00 PM, generated
  // or by hand. Never overridable (same tier as double-booking).
  if (entry.startTime < DAY_START_TIME || entry.endTime > DAY_END_TIME) {
    return `${HARD_CONFLICT_PREFIX}Classes must be scheduled between 7:30 AM and 8:00 PM — this session runs ${entry.startTime}-${entry.endTime}.`
  }

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

  // ── Engine-parity hard constraints (0d–0e) ────────────────────────────────
  // These mirror the backtracking engine's hard constraints so a chair cannot
  // place manually what auto-generation would refuse to place. See
  // lib/services/scheduler.ts — checkLabSpecialization / roomTypeCompatible.

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

  // 0e. Room type — the subject's explicit requiredRoomType, or the type-based
  // default from lib/room-type-rules.ts (laboratory subjects need a lab room,
  // computer-based labs a Computer Laboratory, lectures a lecture room). Same
  // rule the engine applies, so a chair cannot hand-place what generation
  // would refuse.
  if (subject && roomAccess && !isTbaRoom) {
    if (!roomTypeAllowedForSubject(roomAccess.type, subject)) {
      return `Room type mismatch: "${subject.code}" must be held in a ${describeRequiredRoomTypes(subject)}, but ${roomAccess.code} is a ${String(roomAccess.type).replace(/_/g, " ").toLowerCase()}.`
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
      !sameMergedClass(e) &&
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
      !sameMergedClass(e) &&
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
    // STRICTLY this schedule's term. Availability is recorded per Academic Year +
    // Semester (Faculty Availability → Term), and terms never share data: a
    // 2nd-semester schedule is checked against 2nd-semester availability only.
    // (This used to fall back to the active semester's rows — the one place
    // 1st- and 2nd-semester data bled into each other.) The generator applies the
    // same rule (generate/route.ts), so both paths always agree.
    const availability = await db.facultyAvailability.findMany({
      where: { facultyId: entry.facultyId, semesterId: schedule.semesterId },
    })
    if (availability.length === 0) {
      const fname = faculty?.user ? `${faculty.user.firstName} ${faculty.user.lastName}` : "This faculty member"
      return `${fname} has no availability recorded for this term and cannot be scheduled. Open Faculty Availability, choose this term, and mark their hours first.`
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
    // Code-aware (a tag may be "GEC01 - Understanding the Self" or just "GEC01") and
    // identical to the generator's matcher — there is no GEC exemption on either side.
    if (!specializationsCoverSubject(faculty.specializations, subject.title, subject.code)) {
      return `Specialization mismatch: ${faculty.user ? `${faculty.user.firstName} ${faculty.user.lastName}` : "this faculty member"} is not tagged for "${subject.code} - ${subject.title}" (their specializations: ${faculty.specializations.join(", ")}). Add it on the Faculty page first.`
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
    // Year-level match — engine parity. The generator places a subject by the
    // program's CURRICULUM MAP (a shared subject like GEC11 is Year 2 for one
    // program and Year 1 for another; a single Subject.year cannot say that), so
    // the check here consults the same map first and only falls back to the
    // stored year for unmapped programs or off-curriculum subjects. Without this a
    // generated GEC class could never be edited by hand ("Year mismatch").
    const secYear = section.yearLevel?.level
    const progAbbrForYear = section.yearLevel?.program?.abbreviation
    if (subject.year && secYear) {
      let yearOk = subject.year === secYear
      let mappedYear: number | null = null
      if (!yearOk && progAbbrForYear && scheduleSemType && hasCurriculumMap(progAbbrForYear)) {
        const codeLower = (subject.code ?? "").toLowerCase()
        const inThisYear = getCurriculumCodes(progAbbrForYear, secYear, scheduleSemType).some((c) => c.toLowerCase() === codeLower)
        if (inThisYear) {
          yearOk = true
        } else {
          for (let y = 1; y <= 5 && mappedYear === null; y++) {
            if (getCurriculumCodes(progAbbrForYear, y, scheduleSemType).some((c) => c.toLowerCase() === codeLower)) mappedYear = y
          }
        }
      }
      if (!yearOk) {
        const shownYear = mappedYear ?? subject.year
        return `Year mismatch: "${subject.code}" is a Year ${shownYear} subject${mappedYear ? ` for ${progAbbrForYear}` : ""} but ${section.name} is Year ${secYear}. Please select a matching section.`
      }
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
  excludeEntryId?: string | string[]
): Promise<string | null> {
  const MAX_DAILY_HOURS = 10   // engine DEFAULT_CONSTRAINTS.maxDailyLoad
  const GLOBAL_MAX_WEEKLY_UNITS = MAX_UNITS_ANY_TYPE // engine DEFAULT_CONSTRAINTS.maxWeeklyUnits (COSI 40)
  const excluded = excludeIds(excludeEntryId)

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    select: { semesterId: true },
  })

  const [faculty, subject, rawFacultyEntries] = await Promise.all([
    db.faculty.findUnique({
      where: { id: entry.facultyId },
      select: { employeeId: true, employmentType: true, maxUnitsPerWeek: true, maxHoursPerWeek: true, user: { select: { firstName: true, lastName: true } } },
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
            ...(excluded.length ? { id: { notIn: excluded } } : {}),
          },
          select: {
            id: true, subjectId: true, sectionId: true, set: true, mergeGroupId: true,
            day: true, startTime: true, endTime: true,
            subject: { select: { units: true, type: true } },
          },
        })
      : Promise.resolve([]),
  ])

  // A merged NSTP class is one row per section but ONE teaching block for the
  // faculty — keep a single row per (merge group, day, time) so its minutes and
  // units are counted once. The row being added is part of that same block
  // when it shares the merge group and time, so it adds nothing either.
  const seenBlocks = new Set<string>()
  const facultyEntries = rawFacultyEntries.filter((e) => {
    if (!e.mergeGroupId) return true
    const key = `${e.mergeGroupId}|${e.day}|${e.startTime}|${e.endTime}`
    if (seenBlocks.has(key)) return false
    seenBlocks.add(key)
    return true
  })
  const entryIsCountedBlock =
    !!entry.mergeGroupId && seenBlocks.has(`${entry.mergeGroupId}|${entry.day}|${entry.startTime}|${entry.endTime}`)

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
  // A merged class is one assignment however many sections sit in it.
  const assignmentKey = (e: { subjectId: string; sectionId: string; set?: string | null; mergeGroupId?: string | null }) =>
    e.mergeGroupId ? `merged__${e.mergeGroupId}` : `${e.subjectId}__${e.sectionId}__${e.set ?? ""}`
  const assignmentUnits = new Map<string, number>()
  for (const e of facultyEntries) {
    assignmentUnits.set(assignmentKey(e), e.subject?.units ?? 0)
  }
  const currentUnits = [...assignmentUnits.values()].reduce((a, b) => a + b, 0)

  // The per-faculty cap the chair sets on the Faculty page, bounded by the
  // engine's global ceiling.
  const effectiveMax = Math.min(faculty?.maxUnitsPerWeek ?? GLOBAL_MAX_WEEKLY_UNITS, GLOBAL_MAX_WEEKLY_UNITS)
  const thisKey = assignmentKey(entry)
  // Adding another session to an assignment already counted adds no new units.
  const addedUnits = assignmentUnits.has(thisKey) ? 0 : (subject?.units ?? 0)

  if (currentUnits + addedUnits > effectiveMax) {
    return `${fname} would be at ${currentUnits + addedUnits} units this week, over the ${effectiveMax}-unit limit for ${formatFacultyType(faculty?.employmentType)} faculty.`
  }

  // ── Weekly hours (Faculty.maxHoursPerWeek) ──────────────────────────────
  // Every session counts — an MWF class is three sessions of contact hours.
  const entryStart = toMinutes(entry.startTime)
  const entryEnd = toMinutes(entry.endTime)
  const entryMinutes = entryIsCountedBlock ? 0 : entryEnd - entryStart
  const maxHours = faculty?.maxHoursPerWeek ?? 0
  if (maxHours > 0) {
    const weeklyMinutes = facultyEntries.reduce((sum, e) => sum + (toMinutes(e.endTime) - toMinutes(e.startTime)), 0)
    const projected = weeklyMinutes + entryMinutes
    if (projected > maxHours * 60) {
      return `${fname} would be at ${(projected / 60).toFixed(1)} hours this week, over their ${maxHours}-hour limit.`
    }
  }

  // ── Daily load ──────────────────────────────────────────────────────────
  const sameDayMinutes = facultyEntries
    .filter((e) => e.day === entry.day)
    .reduce((sum, e) => sum + (toMinutes(e.endTime) - toMinutes(e.startTime)), 0)
  const totalDailyMinutes = sameDayMinutes + entryMinutes
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
