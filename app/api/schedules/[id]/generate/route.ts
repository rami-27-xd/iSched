import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { SchedulingEngine, SchedulingError, type GenerationResult, type LockedEntry } from "@/lib/services/scheduler"
import { getCurriculumCodes, hasCurriculumMap } from "@/lib/curriculum-map"
import { CLUSTER_GEC_CODES } from "@/lib/services/subject-permissions"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { createNotification } from "@/lib/notifications"
import { syncFacultySpecializations } from "@/lib/services/sync-specializations"
import { detectCrossScheduleConflicts, type CrossScheduleEntry } from "@/lib/services/cross-schedule-conflicts"

// Allow up to 60 seconds for schedule generation
export const maxDuration = 60

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(
        apiError("Only Department Chairpersons and Program Chairpersons can run schedule generation"),
        { status: 403 }
      )
    }

    const isAdmin = dbUser.role === "ADMIN"
    const isSuperAdmin = dbUser.role === "SUPER_ADMIN"

    const { id } = await params

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: { semester: true, department: { include: { college: true } } },
    })

    if (!schedule) {
      return NextResponse.json(apiError("Schedule not found"), { status: 404 })
    }

    // Program Chairs generate on DRAFT only (their full major load, once the
    // Dept Chair has plotted GEC — see the "Workflow order" comment below for
    // the current, inverted sequence: DC plots GEC first, no PC-submission gate).
    if (isAdmin && schedule.status !== "DRAFT") {
      return NextResponse.json(
        apiError("Program Chairs can only generate schedules in Draft status"),
        { status: 400 }
      )
    }

    // CAS has no Program Chairs — the Dept Chair generates all subjects directly.
    // Detect this early so the submission gate and section scoping can be skipped for CAS.
    let isCasAdmin = false
    if (isSuperAdmin) {
      const userDeptId = getUserDepartmentId(dbUser)
      if (userDeptId) {
        const userDeptRecord = await db.department.findUnique({
          where: { id: userDeptId },
          include: { college: true },
        })
        isCasAdmin = userDeptRecord?.college?.abbreviation === "CAS"
      }
    }

    // Determine if the CAS chair is generating their OWN CAS schedule or injecting
    // GEC into another department's schedule (e.g. CIT, CAHM).
    // - Own schedule  → generate cluster majors + cluster GEC for CAS sections only.
    // - Other dept    → generate ONLY cluster GEC codes for that dept's sections.
    //   This keeps each department's schedule isolated: CIT schedule has CIT majors +
    //   GEC; CAS schedule has CAS majors + GEC. BAComm sections never appear in CIT.
    const isCasOwnSchedule = isCasAdmin && schedule.department?.college?.abbreviation === "CAS"
    const isCasInjectingOther = isCasAdmin && !isCasOwnSchedule

    // Each CAS Dept Chair is assigned to one of three clusters (Social Sciences, LLH, MNS).
    // When a cluster is assigned, generation is scoped to only the programs in that cluster.
    // clusterId=null means the chair has full CAS access (fallback / super-user).
    let casClusterProgramIds: string[] | null = null
    if (isCasAdmin && (dbUser as any).clusterId) {
      const clusterProgs = await db.program.findMany({
        where: { clusterId: (dbUser as any).clusterId },
        select: { id: true },
      })
      casClusterProgramIds = clusterProgs.map((p: any) => p.id)
    }

    // Resolve cluster GEC codes for this CAS chair (mapping lives in
    // lib/services/subject-permissions.ts — shared with manual-entry checks).
    // NSTP/PATHFIT are always excluded from auto-generation (manually scheduled).
    let clusterGecCodes: string[] = []
    if (isCasAdmin && (dbUser as any).clusterId) {
      const userCluster = await db.facultyCluster.findUnique({
        where: { id: (dbUser as any).clusterId },
        select: { name: true },
      })
      clusterGecCodes = CLUSTER_GEC_CODES[userCluster?.name ?? ""] ?? []
    }

    // ── Workflow order (spec Section 2 — INVERTED from the old build) ──────────
    // The Department Chairperson now plots GEC/GEL FIRST, before Program Chairs add
    // their majors. There is therefore NO "Program Chairs must submit before GEC"
    // gate anymore (that gate enforced the opposite, old order). GEC generation is
    // instead hard-constrained only by any already-plotted CIT laboratory subjects,
    // which the engine already treats as locked slots via the cross-schedule
    // lockedEntries below (a GEC subject can never be placed in a slot a CIT lab
    // already occupies — with no override, per spec). Program Chairs are unlocked to
    // add their full major load once the Dept Chair has generated/finalized GEC.

    // For ADMIN: resolve their program so we can scope subjects and sections
    const programId: string | null = isAdmin
      ? ((dbUser as any).programHead?.programId ?? null)
      : null
    const programDepartmentId: string | null = isAdmin
      ? ((dbUser as any).programHead?.program?.departmentId ?? null)
      : null

    if (isAdmin && !programId) {
      return NextResponse.json(
        {
          success: false,
          error: "Program Chair not assigned to a program",
          details: ["Your account must be linked to a specific program before generating a schedule."],
        },
        { status: 400 }
      )
    }

    // Department to scope against:
    //   ADMIN (Program Chair) — always use their own program's department (not the schedule's).
    //   SUPER_ADMIN (Dept Chair) — use THEIR department from the user record (departmentChair).
    //     This is essential now that there are 3 distinct CAS sub-departments; each chair
    //     should only generate GEC subjects belonging to their own sub-department.
    //     Falls back to schedule.departmentId for backwards-compat while old chairs are migrated.
    const deptId: string | undefined = isAdmin
      ? (programDepartmentId ?? schedule.departmentId ?? undefined)
      : (getUserDepartmentId(dbUser) ?? schedule.departmentId ?? undefined)

    // Department that room access is scoped against for this run.
    const roomScopeDeptId: string | undefined = isCasInjectingOther
      ? (schedule.departmentId ?? deptId)
      : deptId

    // Prefixes excluded from all auto-generation (NSTP/PATHFIT are manually scheduled)
    const EXCLUDED_AUTO = ["NSTP", "NST", "PATHFIT", "PATHFit"]
    const notAutoExcluded = { AND: EXCLUDED_AUTO.map(p => ({ code: { not: { startsWith: p } } })) }

    // GEC prefix codes — used to exclude GEC from ADMIN (major-subjects-only) scope
    const GEC_PREFIXES = ["GEC", "GEL"]
    const notGecFilter = {
      AND: GEC_PREFIXES.map((p) => ({ code: { not: { startsWith: p } } })),
    }

    // Major subjects must match the schedule's semester (a 1st-sem schedule must not
    // generate 2nd-sem subjects like FLS02). GEC is exempt — its semester placement
    // varies per program, so the engine's year-level match handles it instead.
    const semType = schedule.semester?.type ?? null
    const semesterFilter = semType ? { semester: semType } : {}

    // CIT pre-plotted labs are locked (spec Section 2 / 4.2). When a CIT Program Chair
    // (re)generates their major load, any laboratory subject that already has entries in
    // this schedule is left untouched — those slots were fixed during the pre-plot stage
    // and the Dept Chair's GEC was scheduled around them. The excluded labs keep their
    // entries and are fed to the engine as locked slots (see lockedEntries below).
    const isCitAdmin =
      isAdmin && (dbUser as any).programHead?.program?.department?.college?.abbreviation === "CIT"
    let citLockedLabSubjectIds: string[] = []
    if (isCitAdmin) {
      const plottedLabs = await db.scheduleEntry.findMany({
        where: { scheduleId: id, subject: { type: "LABORATORY" } },
        select: { subjectId: true },
        distinct: ["subjectId"],
      })
      citLockedLabSubjectIds = plottedLabs.map((e: any) => e.subjectId)
    }

    // Labs-only pre-plot stage (spec Section 2 Step 1 / 4.2): before the Dept
    // Chairperson has generated GEC/GEL into this schedule, a CIT Program
    // Chairperson may only place LABORATORY subjects — labs are locked in first
    // so GEC gets scheduled around them. Manual entry (POST /entries) already
    // hard-blocks this per-subject; bulk Generate had no equivalent, so a CIT
    // chair could auto-generate their FULL major load (lecture + lab) before
    // GEC existed, silently skipping the pre-plot stage. Scope Generate to labs
    // only during this stage instead of blocking it outright, so "Generate" still
    // does something useful (auto-places the labs) rather than just erroring.
    let citLabsOnlyStage = false
    if (isCitAdmin) {
      const gecPlotted = await db.scheduleEntry.count({
        where: {
          scheduleId: id,
          OR: [
            { subject: { code: { startsWith: "GEC" } } },
            { subject: { code: { startsWith: "GEL" } } },
          ],
        },
      })
      citLabsOnlyStage = gecPlotted === 0
    }

    const subjectWhere: any = isAdmin
      ? {
          // Preserve CIT pre-plotted labs (no-op when the list is empty).
          id: { notIn: citLockedLabSubjectIds },
          // Labs-only pre-plot stage — restrict to LABORATORY subjects until GEC exists.
          ...(citLabsOnlyStage ? { type: "LABORATORY" } : {}),
          // ADMIN (Program Chair): major subjects only — no GEC (Dept Chair handles those)
          OR: [
            // This program's specific major subjects — Subject.semester is authoritative
            // here: a major subject belongs to exactly one program's curriculum, so it
            // only ever needs one semester value.
            { programId, ...semesterFilter },
            // Dept-wide non-GEC "cognate" subjects shared across multiple programs in
            // this department (e.g. RES, FLO, OJT, CHM01a, MAT04a, COM01a...). NOT
            // filtered by Subject.semester: the row stores only ONE semester value, but
            // each program that shares this code places it in its OWN semester per its
            // own curriculum (e.g. CHM01a is Year-2/FIRST for one BSIT track but
            // Year-1/SECOND for another). Fetch every dept-wide non-GEC/non-manual code
            // regardless of its stored semester; gecAllowedSectionIds() below (via the
            // curriculum map) narrows each one down to only the sections that actually
            // need it in THIS schedule's semester — mirroring how the GEC/SUPER_ADMIN
            // branches already omit semesterFilter for their programId:null subjects.
            { programId: null, departmentId: deptId, ...notGecFilter, ...notAutoExcluded },
          ],
        }
      : isCasAdmin
        ? isCasInjectingOther
          ? // CAS chair generating INTO another dept's schedule (e.g. CIT):
            // ONLY inject cluster GEC codes — no major subjects from CAS programs.
            // departmentId keeps this from matching the target dept's own
            // programId-null subjects (e.g. CIT's dept-wide RES/OJT).
            clusterGecCodes.length > 0
              ? { departmentId: deptId, programId: null, code: { in: clusterGecCodes } }
              : { departmentId: deptId, programId: null, OR: GEC_PREFIXES.map(p => ({ code: { startsWith: p } })), ...notAutoExcluded }
          : // CAS chair on their OWN CAS schedule: cluster majors + cluster GEC.
            casClusterProgramIds
              ? {
                  departmentId: deptId,
                  OR: [
                    { programId: { in: casClusterProgramIds }, ...semesterFilter },
                    ...(clusterGecCodes.length > 0
                      ? [{ programId: null, code: { in: clusterGecCodes } }]
                      : [{ programId: null, ...notAutoExcluded }]),
                  ],
                }
              : { departmentId: deptId, ...semesterFilter, ...notAutoExcluded }
        : {
            // Non-CAS SUPER_ADMIN: generates ONLY GEC/GEL subjects.
            departmentId: deptId,
            programId: null,
            OR: GEC_PREFIXES.map(p => ({ code: { startsWith: p } })),
            ...notAutoExcluded,
          }

    // Faculty availability is stored PER SEMESTER. When a schedule is generated for a
    // semester OTHER than the one the chair entered availability under (availability is
    // always saved against the active semester — see CLAUDE.md), a strict semesterId
    // match drops every availability row and the engine treats all faculty as
    // unavailable ("availability ignored entirely" — Section 7 / Bug 3). Resolve the
    // active semester as a fallback so availability entered there still applies.
    const activeSemester = await db.semester.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    const availabilitySemesterIds = [
      ...new Set([schedule.semesterId, activeSemester?.id].filter(Boolean) as string[]),
    ]

    const [subjects, faculty, rooms, sections] = await Promise.all([
      db.subject.findMany({
        where: subjectWhere,
        include: { department: true },
      }),
      db.faculty.findMany({
        where: {
          isActive: true,
          // SUPER_ADMIN (Dept Chair): Scope to CAS college (not just the sub-dept), because
          //   faculty records haven't been redistributed to the 3 sub-departments yet. All CAS
          //   faculty are candidates; availability + specialization constraints filter them.
          // ADMIN: their own dept faculty pool (program-specific + dept-wide).
          ...(isSuperAdmin
            ? { department: { college: { abbreviation: "CAS" } } }
            : { departmentId: deptId, OR: [{ programId }, { programId: null }] }
          ),
        },
        include: {
          user: true,
          // Time availability: schedule's semester OR the active-semester fallback.
          // Weekly time slots are saved against the active semester and carry over
          // between terms (Section 7 / Bug 3) — the mapping below prefers the
          // schedule's own rows when present.
          availability: { where: { semesterId: { in: availabilitySemesterIds } } },
          // Building availability: STRICT to the schedule's own semester — no
          // cross-semester fallback. Which buildings a faculty may teach in is a
          // per-term decision, so a 2nd-semester schedule must be built against
          // 2nd-semester building access and never silently inherit the 1st
          // semester's rows.
          buildingAvailability: { where: { semesterId: schedule.semesterId } },
        },
      }),
      db.room.findMany({
        // When injecting GEC into another dept's schedule, scope rooms to that dept
        // (GEC classes run in the target dept's buildings, not CAS buildings).
        // A room qualifies when it is fully unrestricted, restricted to this
        // department, or restricted to a specific program (course) of this
        // department — the engine then narrows program-restricted rooms to the
        // matching program's sections only.
        where: {
          isActive: true,
          ...(roomScopeDeptId ? {
            AND: [
              {
                building: {
                  OR: [
                    { departments: { none: {} } },
                    { departments: { some: { departmentId: roomScopeDeptId } } },
                  ],
                },
              },
              {
                OR: [
                  { AND: [{ departments: { none: {} } }, { programs: { none: {} } }] },
                  { departments: { some: { departmentId: roomScopeDeptId } } },
                  { programs: { some: { program: { departmentId: roomScopeDeptId } } } },
                ],
              },
            ],
          } : {}),
        },
        include: { building: true, departments: true, programs: true },
      }),
      db.section.findMany({
        where: isAdmin
          ? { yearLevel: { programId: programId! } }
          : isCasInjectingOther
            ? // Injecting GEC into another dept's schedule: only THAT dept's sections.
              // BAComm/BAHist/etc. (CAS sections) must NOT appear here.
              { yearLevel: { program: { departmentId: schedule.departmentId ?? undefined } } }
            : isCasOwnSchedule
              ? // Own CAS schedule: ALL CAS sections. Cluster majors are constrained
                // to cluster programs via programId matching, but the cluster's GEC
                // codes inject into every CAS program's sections (per compliance spec:
                // e.g. the MNS chair schedules GEC05/GEC08/GEL01 for BAComm too).
                { yearLevel: { program: { departmentId: deptId } } }
            : {
                // Non-CAS SUPER_ADMIN (Dept Chair): GEC now generates FIRST for EVERY
                // section in the department — no longer restricted to programs whose
                // Program Chair has already submitted (that was the old, inverted order).
                yearLevel: { program: { departmentId: deptId } },
              },
        include: {
          yearLevel: {
            include: {
              program: {
                include: { department: { include: { college: { select: { abbreviation: true } } } } },
              },
            },
          },
        },
      }),
    ])

    // GEC/shared subjects (programId=null) have a per-program year/semester
    // placement that a single Subject.year value cannot express (GEC11 is Year 1
    // for CIT but Year 2 for BAComm). Resolve the exact allowed sections from the
    // curriculum map for the schedule's semester. Sections whose program has no
    // curriculum map fall back to the engine's year-match rule.
    const mapSemType = schedule.semester?.type as "FIRST" | "SECOND" | undefined
    function gecAllowedSectionIds(subj: any): string[] | null {
      if (subj.programId) return null          // majors: programId+year matching is correct
      if (!mapSemType) return null             // no semester context — keep default behavior
      const allowed: string[] = []
      for (const sec of sections as any[]) {
        const progAbbr = sec.yearLevel?.program?.abbreviation
        const yl = sec.yearLevel?.level
        if (!progAbbr || !yl) continue
        if (hasCurriculumMap(progAbbr)) {
          const codes = getCurriculumCodes(progAbbr, yl, mapSemType)
          if (codes.some((c: string) => c.toLowerCase() === subj.code.toLowerCase())) {
            allowed.push(sec.id)
          }
        } else if (yl === (subj.year ?? 1) && (!subj.semester || subj.semester === mapSemType)) {
          // Unmapped program — year match, now ALSO gated on the subject's own stored
          // semester (Section 7 / Bug 1). Without this the fallback matched by year
          // alone, so a subject belonging strictly to the OTHER semester leaked into
          // this schedule. Mapped programs are unaffected (the curriculum map above is
          // already semester-aware); this only tightens the no-map fallback.
          allowed.push(sec.id)
        }
      }
      return allowed
    }

    // Transform data for the scheduling engine
    const subjectInputs = subjects.map((s: any) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      hoursPerWeek: s.hoursPerWeek,
      type: s.type as "LECTURE" | "LABORATORY",
      requiredRoomType: s.requiredRoomType.map(String),
      units: s.units,
      departmentCode: s.department?.abbreviation,
      year: s.year ?? 1,
      programId: s.programId ?? null,
      requiredLabSpecialization: s.requiredLabSpecialization ?? null,
      allowedSectionIds: gecAllowedSectionIds(s),
    }))

    const facultyInputs = faculty.map((f: any) => {
      // Prefer availability entered for THIS schedule's semester; only fall back to the
      // active-semester rows when the faculty has none for the schedule's semester
      // (Section 7 / Bug 3 — see availabilitySemesterIds above).
      const availOwn = f.availability.filter((a: any) => a.semesterId === schedule.semesterId)
      const avail = availOwn.length > 0 ? availOwn : f.availability
      return {
        id: f.id,
        name: `${f.user.firstName} ${f.user.lastName}`,
        specializations: f.specializations,
        sectionCounts: (f.sectionCounts as Record<string, number>) ?? {},
        maxUnitsPerWeek: f.maxUnitsPerWeek,
        availability: avail.map((a: any) => ({
          day: a.day as any,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
        // Distinct building IDs this faculty may teach in THIS semester. Rows were
        // filtered to schedule.semesterId at query time — no cross-semester
        // fallback, so 2nd-semester generation strictly honors 2nd-semester
        // building access.
        allowedBuildingIds: f.buildingAvailability.map((b: any) => b.buildingId),
      }
    })

    const roomInputs = rooms.map((r: any) => {
      // Union semantics: if the room is unrestricted, or its department
      // restrictions cover this run's department, every section may use it.
      // Otherwise it qualified via a program (course) restriction — the engine
      // must limit it to sections of those programs (Hard Constraint).
      const deptEntries = r.departments ?? []
      const programEntries = r.programs ?? []
      const openToWholeDept =
        (deptEntries.length === 0 && programEntries.length === 0) ||
        deptEntries.some((d: any) => d.departmentId === roomScopeDeptId)
      return {
        id: r.id,
        code: r.code,
        type: r.type,
        buildingId: r.building?.id ?? r.buildingId,
        buildingCode: r.building?.code,
        labSpecialization: r.labSpecialization ?? null,
        allowedProgramIds: openToWholeDept ? [] : programEntries.map((p: any) => p.programId),
      }
    })

    const sectionInputs = sections.map((s: any) => ({
      id: s.id,
      name: s.name,
      yearLevel: s.yearLevel?.level ?? 1,
      programId: s.yearLevel?.programId ?? null,
      // Saturday classes are reserved for CAM (College of Allied Medicine) sections
      // and NSTP subjects — the engine enforces this as a hard constraint.
      allowSaturday: s.yearLevel?.program?.department?.college?.abbreviation === "CAM",
    }))

    // Pre-flight: sections must exist
    if (sectionInputs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: isAdmin ? "No sections found for your program" : "No sections found for this department",
          details: [
            isAdmin
              ? "Add year levels and sections for your program before generating a schedule"
              : "Add year levels and sections for the programs in this department before generating a schedule",
          ],
        },
        { status: 422 }
      )
    }

    // Pre-flight: rooms must exist
    if (roomInputs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No active rooms found",
          details: ["Add at least one active room in Buildings & Rooms before generating a schedule"],
        },
        { status: 422 }
      )
    }

    const facultyWithAvailability = facultyInputs.filter((f: any) => f.availability.length > 0)
    if (facultyWithAvailability.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No faculty have availability configured for this semester",
          details: [
            "Go to Faculty Availability and set available days/times for at least one faculty member",
            `Semester: ${schedule.semester?.type ?? "Unknown"}`,
            `Faculty loaded: ${facultyInputs.length} (${isAdmin ? "program + dept-wide pool" : "full department"})`,
          ],
        },
        { status: 422 }
      )
    }

    // Load existing entries this run must not displace:
    //   1. Entries in THIS schedule for subjects NOT being regenerated now
    //      (e.g. major-subject rows when SUPER_ADMIN regenerates GEC only, and vice-versa).
    //   2. Entries in OTHER schedules for the same semester
    //      (prevents two concurrent departments from double-booking the same room/faculty).
    const subjectIdsBeingRegenerated = subjectInputs.map((s: any) => s.id)
    const rawLockedEntries = await db.scheduleEntry.findMany({
      where: {
        OR: [
          // Intra-schedule: entries for subjects we are NOT regenerating
          { scheduleId: id, subjectId: { notIn: subjectIdsBeingRegenerated } },
          // Cross-schedule: all entries in other non-archived schedules for the same semester
          { schedule: { semesterId: schedule.semesterId, isArchived: false, id: { not: id } } },
        ],
      },
      select: {
        facultyId: true,
        roomId: true,
        sectionId: true,
        set: true,
        day: true,
        startTime: true,
        endTime: true,
      },
    })
    const lockedEntries: LockedEntry[] = rawLockedEntries.map((e: any) => ({
      facultyId: e.facultyId,
      roomId: e.roomId,
      sectionId: e.sectionId,
      set: e.set ?? null,
      day: e.day,
      startTime: e.startTime,
      endTime: e.endTime,
    }))

    const engine = new SchedulingEngine(
      subjectInputs,
      facultyInputs,
      roomInputs,
      sectionInputs,
      {},
      lockedEntries
    )

    console.log(
      `[generate] role:${dbUser.role} dept:${deptId?.slice(-6) ?? "all"} program:${programId?.slice(-6) ?? "all"} | ` +
      `${subjectInputs.length} subjects (${isAdmin ? "major only, GEC/PATHFIT excluded" : "all incl. GEC/PATHFIT"}), ` +
      `${facultyInputs.length} faculty (${facultyWithAvailability.length} with avail), ` +
      `${roomInputs.length} rooms, ${sectionInputs.length} sections`
    )

    let result: GenerationResult
    try {
      result = await engine.generate()
    } catch (engineError: any) {
      if (engineError.name === "SchedulingError") throw engineError
      console.error("[generate] Unexpected engine error:", engineError)
      throw new SchedulingError("Scheduler encountered an unexpected error", [
        engineError.message ?? "Unknown error",
      ])
    }

    console.log(
      `[generate] Scheduler completed: ${result.assignments.length} assignments, ${result.unassigned.length} unassigned`
    )

    // Build a lookup so we can check subject type when persisting
    const subjectTypeMap = new Map(subjects.map((s: any) => [s.id, s.type as string]))

    // Expand assignments into ScheduleEntry rows:
    //   Labs    → one entry (single continuous session), duplicated as Set A and Set B
    //   Lectures → one entry per session (primary + extraSessions from the day-group pattern)
    type EntryRow = {
      scheduleId: string; subjectId: string; facultyId: string; roomId: string
      sectionId: string; day: string; startTime: string; endTime: string
      createdBy: string; set: string | null; groupId: string | null
    }
    const entryRows: EntryRow[] = (result.assignments as any[]).flatMap((a): EntryRow[] => {
      const isLab = subjectTypeMap.get(a.subjectId) === "LABORATORY"
      const base = {
        scheduleId: id, subjectId: a.subjectId, facultyId: a.facultyId,
        roomId: a.roomId, sectionId: a.sectionId, createdBy: dbUser.id,
      }
      if (isLab) {
        // Labs: each set was scheduled independently — one entry per set, different slots
        return [{ ...base, day: a.day, startTime: a.startTime, endTime: a.endTime, set: a.set ?? "A", groupId: null }]
      }
      // Lectures: one row per session day (primary + extraSessions from day-group pattern)
      const sessions: { day: string; startTime: string; endTime: string }[] = [
        { day: a.day, startTime: a.startTime, endTime: a.endTime },
        ...(a.extraSessions ?? []),
      ]
      // Multi-day pattern (e.g. MWF/TTh) — tag every row from this assignment with a
      // shared groupId so PATCH/DELETE can treat them as one logical entry. A single
      // session lecture has nothing to group, so it keeps groupId: null.
      const groupId = sessions.length > 1 ? crypto.randomUUID() : null
      return sessions.map(s => ({ ...base, day: s.day, startTime: s.startTime, endTime: s.endTime, set: null, groupId }))
    })

    // Safety check: if the engine returned 0 assignments AND every subject landed in
    // the unassigned queue, refuse to clear existing entries. This prevents a config
    // mistake (e.g. deleted availability) from silently wiping all manually-placed entries.
    if (entryRows.length === 0 && result.unassigned.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Generation produced no schedulable entries",
          details: [
            `All ${result.unassigned.length} subject-section task(s) could not be assigned.`,
            "Existing entries have been preserved. Fix the issues below and try again.",
            ...result.unassigned.slice(0, 5).map(u => `• ${u.subjectCode} → ${u.sectionName}: ${u.reason}`),
            ...(result.unassigned.length > 5 ? [`...and ${result.unassigned.length - 5} more`] : []),
          ],
        },
        { status: 422 }
      )
    }

    // Persist results:
    //   Both roles use a scoped delete — only remove entries for subjects in THIS run.
    //   This preserves major subject entries when the Dept Chair regenerates GEC into
    //   a shared schedule, and preserves GEC entries when the Program Chair regenerates
    //   their major subjects. Full-schedule wipes are too destructive when one schedule
    //   serves both roles.
    //
    //   CAS cluster chairs share one schedule but each owns a subset of sections.
    //   GEC subjects (programId=null) appear in every cluster's subject scope, so a plain
    //   subjectId-only delete would wipe another chair's GEC entries for their sections.
    //   Solution: scope the delete to THIS chair's sections when they have a cluster.
    //
    //   Unassigned queue — full delete: always represents the LATEST run.
    const subjectIds = subjects.map((s: any) => s.id)
    const sectionIds = sections.map((s: any) => s.id)

    const entryDeleteWhere = isCasAdmin && casClusterProgramIds
      ? { scheduleId: id, subjectId: { in: subjectIds }, sectionId: { in: sectionIds } }
      : { scheduleId: id, subjectId: { in: subjectIds } }

    // Unassigned-queue delete scope: mirror the entry delete — only this run's
    // subjects × sections. The section pool now spans ALL CAS sections for cluster
    // chairs (GEC injects university-wide), so a section-wide wipe would erase
    // other chairs' queues. Stale rows from re-scoped subjects are handled by
    // prisma/cleanup-cross-dept-entries.ts.
    const unassignedDeleteWhere = isCasAdmin && casClusterProgramIds
      ? { scheduleId: id, subjectId: { in: subjectIds }, sectionId: { in: sectionIds } }
      : { scheduleId: id, subjectId: { in: subjectIds } }

    await db.scheduleEntry.deleteMany({ where: entryDeleteWhere })
    await db.unassignedEntry.deleteMany({ where: unassignedDeleteWhere })

    await db.scheduleEntry.createMany({ data: entryRows as any })

    // ── Cross-schedule conflict detection (Dept Chair GEC generation) ───────
    // lib/services/conflicts.ts (used on publish) only ever compares entries
    // WITHIN one schedule. It cannot see a Dept Chair's newly-generated GEC
    // entries double-booking a room/faculty/section that ANOTHER department's
    // already submitted/published schedule is also using this semester. Runs
    // for every SUPER_ADMIN generation (not gated on the CAS-specific flags —
    // the whole point is checking against OTHER departments). Never blocks
    // generation: entries are already persisted above, so any failure here is
    // logged and swallowed.
    let conflictsDetected = 0
    if (isSuperAdmin) {
      try {
        // Re-fetch this run's just-written rows with real DB ids — createMany
        // does not return created records. entryDeleteWhere is the exact
        // predicate used to delete-then-insert this run's entries above, so
        // querying with it here picks up precisely (and only) what was just
        // created, nothing stale from a previous run.
        const createdEntries = await db.scheduleEntry.findMany({
          where: entryDeleteWhere,
          select: {
            id: true, scheduleId: true, subjectId: true, facultyId: true,
            roomId: true, sectionId: true, day: true, startTime: true,
            endTime: true, set: true,
          },
        })

        // Hydrate schedule A's side from the arrays already fetched for the
        // engine (subjects/faculty/rooms/sections) — no extra join query needed.
        const subjectCodeMap = new Map(subjects.map((s: any) => [s.id, s.code]))
        const facultyNameMap = new Map(faculty.map((f: any) => [f.id, `${f.user.firstName} ${f.user.lastName}`]))
        const roomCodeMap = new Map(rooms.map((r: any) => [r.id, r.code]))
        const sectionNameMap = new Map(sections.map((s: any) => [s.id, s.name]))

        const entriesA: CrossScheduleEntry[] = createdEntries.map((e: any) => ({
          id: e.id,
          scheduleId: e.scheduleId,
          day: e.day,
          startTime: e.startTime,
          endTime: e.endTime,
          roomId: e.roomId,
          roomCode: roomCodeMap.get(e.roomId) ?? "Unknown Room",
          facultyId: e.facultyId,
          facultyName: facultyNameMap.get(e.facultyId) ?? "Unknown Faculty",
          sectionId: e.sectionId,
          sectionName: sectionNameMap.get(e.sectionId) ?? "Unknown Section",
          subjectCode: subjectCodeMap.get(e.subjectId) ?? "Unknown Subject",
          set: e.set,
        }))

        // Schedule B: entries from OTHER departments' already-submitted/published
        // schedules for the same semester. Drafts are excluded — nothing to
        // conflict with yet until a department has actually submitted.
        const otherEntries = await db.scheduleEntry.findMany({
          where: {
            scheduleId: { not: id },
            schedule: {
              semesterId: schedule.semesterId,
              isArchived: false,
              status: { in: ["PENDING_APPROVAL", "PUBLISHED"] },
            },
          },
          include: {
            subject: { select: { code: true } },
            faculty: { include: { user: { select: { firstName: true, lastName: true } } } },
            room: { select: { code: true } },
            section: { select: { name: true } },
          },
        })

        const entriesB: CrossScheduleEntry[] = otherEntries.map((e: any) => ({
          id: e.id,
          scheduleId: e.scheduleId,
          day: e.day,
          startTime: e.startTime,
          endTime: e.endTime,
          roomId: e.roomId,
          roomCode: e.room?.code ?? "Unknown Room",
          facultyId: e.facultyId,
          facultyName: e.faculty?.user ? `${e.faculty.user.firstName} ${e.faculty.user.lastName}` : "Unknown Faculty",
          sectionId: e.sectionId,
          sectionName: e.section?.name ?? "Unknown Section",
          subjectCode: e.subject?.code ?? "Unknown Subject",
          set: e.set,
        }))

        const hits = detectCrossScheduleConflicts(entriesA, entriesB)
        conflictsDetected = hits.length

        // Always clear this schedule's own previous CROSS_SCHEDULE_* rows —
        // its entries were just fully regenerated (the old entry ids those rows
        // reference no longer exist), so any prior-run row is stale regardless
        // of whether this run still finds conflicts. Without this unconditional
        // clear, a since-resolved conflict's row lingers forever and keeps
        // blocking publish (see publish/route.ts's unresolvedCrossSchedule gate).
        await db.conflictLog.deleteMany({
          where: { scheduleId: id, type: { startsWith: "CROSS_SCHEDULE_" } },
        })

        if (hits.length > 0) {
          const otherScheduleIds = [...new Set(hits.map(h => h.scheduleIdB))]

          // Clear stale CROSS_SCHEDULE_* rows on the other side for schedules this
          // run still conflicts with, before inserting fresh ones — avoids
          // duplicate rows piling up across repeated regenerations.
          await db.conflictLog.deleteMany({
            where: {
              scheduleId: { in: otherScheduleIds },
              type: { startsWith: "CROSS_SCHEDULE_" },
            },
          })

          await db.conflictLog.createMany({
            data: hits.flatMap(h => [
              { scheduleId: h.scheduleIdA, type: h.type, description: h.description, entityIds: [h.entryIdA] },
              { scheduleId: h.scheduleIdB, type: h.type, description: h.description, entityIds: [h.entryIdB] },
            ]),
          })

          // Notify each OTHER schedule's owner once (summarized), plus the
          // generating Dept Chair once with the total.
          for (const otherId of otherScheduleIds) {
            const count = hits.filter(h => h.scheduleIdB === otherId).length
            const otherSchedule = await db.schedule.findUnique({
              where: { id: otherId },
              select: { createdBy: true },
            })
            if (otherSchedule?.createdBy) {
              await createNotification({
                userId: otherSchedule.createdBy,
                title: "Cross-Department Scheduling Conflict",
                message: `${count} conflict${count > 1 ? "s" : ""} detected between your schedule and another department's newly generated schedule (room, faculty, or section double-booking). Review and resolve before publishing.`,
                type: "conflict_detected",
                link: "/dashboard/schedules",
              })
            }
          }

          await createNotification({
            userId: dbUser.id,
            title: "Cross-Department Conflicts Found",
            message: `${hits.length} cross-department scheduling conflict${hits.length > 1 ? "s" : ""} detected against ${otherScheduleIds.length} other schedule${otherScheduleIds.length > 1 ? "s" : ""} while generating. Review the Conflicts panel before publishing.`,
            type: "conflict_detected",
            link: "/dashboard/schedules",
          })
        }
      } catch (crossConflictError) {
        console.error("[generate] Cross-schedule conflict detection failed (non-fatal):", crossConflictError)
      }
    }

    if (result.unassigned.length > 0) {
      await db.unassignedEntry.createMany({
        data: result.unassigned.map(u => ({
          scheduleId: id,
          subjectId: u.subjectId,
          sectionId: u.sectionId,
          reason: u.reason,
          // Whoever ran THIS generate owns these failures — the Unassigned
          // Queue is scoped to the generator, not to everyone with schedule access.
          generatedBy: dbUser.id,
        })),
      })
    }

    // Keep status as PENDING_APPROVAL after generation — Dept Chair still needs
    // to approve/reject before it becomes PUBLISHED.
    await db.schedule.update({
      where: { id },
      data: { generatedAt: new Date() },
    })

    const labCount = entryRows.filter(r => r.set !== null).length
    const assignedCount = result.assignments.length
    const stagePrefix = citLabsOnlyStage
      ? "Labs-only pre-plot stage (GEC not yet generated): only laboratory subjects were scheduled. "
      : ""
    const notifMessage = stagePrefix + (result.unassigned.length > 0
      ? `${assignedCount} subject-sections scheduled (${entryRows.length} total entries, ${labCount} labs). ${result.unassigned.length} subject(s) could not be assigned and appear in the Unassigned Queue.`
      : `Backtracking algorithm completed. ${assignedCount} subject-sections scheduled (${entryRows.length} total entries, ${labCount} labs).`)

    await createNotification({
      userId: dbUser.id,
      title: "Schedule Generated",
      message: notifMessage,
      type: "schedule_generated",
      link: "/dashboard/schedules",
    })

    // Back-fill specializations for every faculty that received assignments
    const assignedFacultyIds = [...new Set(entryRows.map((e: any) => e.facultyId).filter(Boolean))]
    await Promise.all(assignedFacultyIds.map((fid: string) => syncFacultySpecializations(fid).catch(() => {})))

    return NextResponse.json(
      apiResponse({
        entriesGenerated: entryRows.length,
        unassignedCount: result.unassigned.length,
        generatedAt: new Date().toISOString(),
        conflictsDetected,
        citLabsOnlyStage,
      })
    )
  } catch (error: any) {
    console.error("POST /api/schedules/[id]/generate error:", error)

    if (error.name === "SchedulingError") {
      let details = error.details ?? []
      if (details.length > 10) {
        const specIssues = details.filter((d: string) =>
          d.includes("No faculty specializations match")
        )
        const roomIssues = details.filter((d: string) =>
          d.includes("No rooms match required type") || d.includes("No rooms with lab specialization")
        )
        const buildingIssues = details.filter((d: string) =>
          d.includes("building availability")
        )
        const otherIssues = details.filter(
          (d: string) =>
            !d.includes("No faculty specializations match") &&
            !d.includes("No rooms match required type") &&
            !d.includes("No rooms with lab specialization") &&
            !d.includes("building availability")
        )
        const summary: string[] = []
        if (specIssues.length > 0) {
          summary.push(
            `${specIssues.length} subjects have no faculty with matching specializations. Update faculty specializations in the Faculty page.`
          )
        }
        if (roomIssues.length > 0) {
          summary.push(
            `${roomIssues.length} subjects have no compatible rooms. Check room types and lab specializations in Buildings / Rooms.`
          )
        }
        if (buildingIssues.length > 0) {
          summary.push(
            `${buildingIssues.length} subjects could not be placed due to building availability restrictions. Ensure faculty have buildings marked as available.`
          )
        }
        summary.push(...otherIssues)
        details = summary
      }
      return NextResponse.json(
        { success: false, error: error.message, details },
        { status: 422 }
      )
    }

    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
