import { db } from "@/lib/db"
import { SchedulingEngine, type LockedEntry } from "@/lib/services/scheduler"
import { getCurriculumCodes, hasCurriculumMap } from "@/lib/curriculum-map"
import { ensurePathfitSentinels } from "@/lib/services/sentinels"
import { PATHFIT_FACULTY_LABEL } from "@/lib/sentinels"
import { createNotification } from "@/lib/notifications"
import { recordAudit } from "@/lib/audit"

/**
 * PATHFit generation — run by the single PATHFIT coordinator account.
 *
 * Places every PATHFit class for every section of the schedule's department as
 * ONE continuous block (a 2-hour class is a single 2-hour session, never split
 * across days), faculty defaulted to the TBA placeholder and the room fixed to
 * the GYM. Both are shared placeholders, so the only constraints are each
 * section's own timetable (this schedule's other entries + every other
 * non-archived schedule of the same semester) and the Saturday rule.
 *
 * This used to be a priority pass inside every Dept Chair generation run. It
 * moved here when PATHFit became its own unit (RBAC spec §3): the Dept Chair's
 * run no longer touches PATHFit, and only this account may add/edit/delete
 * PATHFit entries (lib/services/subject-permissions.ts).
 *
 * Regeneration is scoped: only this schedule's PATHFit entries (for the
 * sections in scope) are replaced; GEC and major entries are untouched.
 */
export type PathfitGenerationResult =
  | { ok: true; body: { entriesGenerated: number; unassignedCount: number; pathfitPlaced: number; generatedAt: string } }
  | { ok: false; status: number; error: string; details?: string[] }

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

  const sentinels = await ensurePathfitSentinels()

  // Per-program placement from the curriculum map (PATHFit01 is Year 1 / 1st sem
  // for most programs but the map is authoritative); unmapped programs fall back
  // to the subject's own year + semester.
  const semType = schedule.semester?.type as "FIRST" | "SECOND" | undefined
  function allowedSectionIds(subj: any): string[] {
    const allowed: string[] = []
    for (const sec of sections as any[]) {
      const progAbbr = sec.yearLevel?.program?.abbreviation
      const yl = sec.yearLevel?.level
      if (!progAbbr || !yl) continue
      if (semType && hasCurriculumMap(progAbbr)) {
        const codes = getCurriculumCodes(progAbbr, yl, semType)
        if (codes.some((c) => c.toLowerCase() === subj.code.toLowerCase())) allowed.push(sec.id)
      } else if (yl === (subj.year ?? 1) && (!semType || !subj.semester || subj.semester === semType)) {
        allowed.push(sec.id)
      }
    }
    return allowed
  }

  const subjectInputs = pathfitSubjects.map((s: any) => ({
    id: s.id,
    code: s.code,
    title: s.title,
    hoursPerWeek: s.hoursPerWeek,
    type: s.type as "LECTURE" | "LABORATORY",
    requiredRoomType: [] as string[],
    units: s.units,
    departmentCode: s.department?.abbreviation,
    year: s.year ?? 1,
    programId: null,
    requiredLabSpecialization: null,
    allowedSectionIds: allowedSectionIds(s),
    fixedAssignment: { facultyId: sentinels.tbaFacultyId, roomId: sentinels.gymRoomId },
  }))

  const sectionInputs = sections.map((s: any) => ({
    id: s.id,
    name: s.name,
    yearLevel: s.yearLevel?.level ?? 1,
    programId: s.yearLevel?.programId ?? null,
    allowSaturday: s.yearLevel?.program?.department?.college?.abbreviation === "CAM",
  }))

  // Everything that must not be displaced: this schedule's non-PATHFit entries and
  // every other non-archived schedule of the same semester.
  const pathfitIds = pathfitSubjects.map((s) => s.id)
  const rawLocked = await db.scheduleEntry.findMany({
    where: {
      OR: [
        { scheduleId, subjectId: { notIn: pathfitIds } },
        { schedule: { semesterId: schedule.semesterId, isArchived: false, id: { not: scheduleId } } },
      ],
    },
    select: { facultyId: true, roomId: true, sectionId: true, set: true, day: true, startTime: true, endTime: true },
  })
  const lockedEntries: LockedEntry[] = rawLocked.map((e: any) => ({
    facultyId: e.facultyId,
    roomId: e.roomId,
    sectionId: e.sectionId,
    set: e.set ?? null,
    day: e.day,
    startTime: e.startTime,
    endTime: e.endTime,
  }))

  // Placeholder-only run: no real faculty or rooms are needed — the engine places
  // fixedAssignment tasks against each section's free hours and returns early.
  const startedAt = Date.now()
  const engine = new SchedulingEngine(subjectInputs as any, [], [], sectionInputs as any, {}, lockedEntries)
  const result = await engine.generate()

  const sectionIds = sections.map((s) => s.id)
  const entryRows = (result.assignments as any[]).map((a) => ({
    scheduleId,
    subjectId: a.subjectId,
    facultyId: a.facultyId,
    facultyName: PATHFIT_FACULTY_LABEL,
    roomId: a.roomId,
    sectionId: a.sectionId,
    day: a.day,
    startTime: a.startTime,
    endTime: a.endTime,
    createdBy: dbUser.id,
    set: null as string | null,
    groupId: null as string | null,
  }))

  if (entryRows.length === 0 && result.unassigned.length > 0) {
    return {
      ok: false,
      status: 422,
      error: "No PATHFit class could be placed",
      details: [
        "Existing entries have been preserved.",
        ...result.unassigned.slice(0, 5).map((u) => `• ${u.subjectCode} → ${u.sectionName}: ${u.reason}`),
      ],
    }
  }

  const scope = { scheduleId, subjectId: { in: pathfitIds }, sectionId: { in: sectionIds } }
  await db.scheduleEntry.deleteMany({ where: scope })
  await db.unassignedEntry.deleteMany({ where: scope })
  if (entryRows.length > 0) await db.scheduleEntry.createMany({ data: entryRows as any })
  if (result.unassigned.length > 0) {
    await db.unassignedEntry.createMany({
      data: result.unassigned
        .filter((u) => u.sectionId)
        .map((u) => ({ scheduleId, subjectId: u.subjectId, sectionId: u.sectionId, reason: u.reason, generatedBy: dbUser.id })),
    })
  }
  await db.schedule.update({ where: { id: scheduleId }, data: { generatedAt: new Date() } })

  const message =
    result.unassigned.length > 0
      ? `${entryRows.length} PATHFit classes placed in the GYM (faculty: TBA). ${result.unassigned.length} could not be placed — see the Unassigned list.`
      : `Done. ${entryRows.length} PATHFit classes placed in the GYM (faculty: TBA).`
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
    summary: `Generated PATHFit for ${schedule.department?.abbreviation ?? "department"} — ${entryRows.length} classes placed, ${result.unassigned.length} unplaced`,
    metadata: {
      Mode: "PATHFit (GYM, faculty TBA)",
      Term: `${schedule.semester?.type ?? ""}`.trim(),
      "Sections in scope": sectionInputs.length,
      "Classes placed": entryRows.length,
      "Could not be placed": result.unassigned.length,
      "Took": `${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
    },
  })

  return {
    ok: true,
    body: {
      entriesGenerated: entryRows.length,
      unassignedCount: result.unassigned.length,
      pathfitPlaced: entryRows.length,
      generatedAt: new Date().toISOString(),
    },
  }
}
