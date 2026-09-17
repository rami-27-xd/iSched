/**
 * Full-coverage test data for CTE, built to guarantee ZERO unassigned subjects
 * when a CTE Program Chairperson generates their schedule for the active term.
 *
 * Unlike seed-cte-test-faculty.ts (random 2-4 specializations per faculty,
 * no coverage guarantee), this script:
 *   1. Computes every non-GEC/GEL/PATHFit/NSTP subject code the curriculum map
 *      calls for across all 11 CTE programs, years 1-4, for the active
 *      semester's term (FIRST/SECOND).
 *   2. Skips codes already covered by an existing active CTE faculty
 *      specialization (specializationsCoverSubject).
 *   3. For every remaining gap, creates ONE dedicated faculty tagged ONLY for
 *      that subject (so it can never compete for a time slot with another
 *      subject), with wide Mon-Fri availability and CTEB building access.
 *   4. Adds LECTURE_LAB rooms to CTEB if it has no LABORATORY/LECTURE_LAB room
 *      yet — CTE's LABORATORY-typed subjects (Food Prep, Electronics Tech,
 *      Drawing, etc.) need one and CTEB previously had only LECTURE_ROOM rooms.
 *      None of these subjects require a specific LabSpecialization.
 *   5. Self-verifies: replicates the ADMIN generate pipeline
 *      (app/api/schedules/[id]/generate/route.ts) in-memory for each of the
 *      11 programs via the real SchedulingEngine (no writes), and for any
 *      subject that STILL comes back unassigned — e.g. a "covered" subject
 *      whose matching faculty turned out to have no free slot — creates one
 *      more dedicated backup faculty for it and re-checks. Repeats up to 3
 *      passes; reports the final unassigned count per program.
 *
 * Idempotent: re-running skips codes that already have a dedicated coverage
 * faculty, or that are otherwise already covered.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-cte-full-coverage.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { getCurriculumCodes, hasCurriculumMap } from "../lib/curriculum-map"
import { specializationsCoverSubject } from "../lib/specialization-match"
import { resolveRequiredRoomTypes } from "../lib/room-type-rules"
import { SchedulingEngine } from "../lib/services/scheduler"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const PLACEHOLDER_ROOM_CODES = ["TBA", "GYM"]

const FIRST_NAMES = ["Maria", "Jose", "Ana", "Carlos", "Elena", "Ramon", "Teresa", "Miguel", "Rosario", "Antonio", "Carmen", "Rodrigo", "Luz", "Fernando", "Corazon", "Isabel", "Danilo", "Grace", "Eduardo", "Marites"]
const LAST_NAMES = ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Mercado", "Villanueva", "Aquino", "Torres", "Ramos", "Garcia", "Fernandez", "Del Rosario", "Pascual", "Navarro", "Castillo", "Gonzales", "Manalo", "Dizon", "Salazar"]
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

/** Create one dedicated, over-provisioned faculty tagged only for this subject. */
async function createCoverageFaculty(cteDeptId: string, cteBuildingId: string | undefined, activeSemesterId: string, employeeId: string, programId: string | null, tag: string) {
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 10000)
  const firstName = pick(FIRST_NAMES)
  const lastName = pick(LAST_NAMES)
  const user = await db.user.create({
    data: { supabaseId: `manual-${stamp}`, email: null, firstName, lastName, role: "FACULTY", isApproved: true, isActive: true, departmentId: cteDeptId },
  })
  const faculty = await db.faculty.create({
    data: { userId: user.id, departmentId: cteDeptId, programId, employeeId, specializations: [tag], maxUnitsPerWeek: 99, maxHoursPerWeek: 80 },
  })
  for (const day of DAYS) {
    await db.facultyAvailability.create({ data: { facultyId: faculty.id, day, startTime: "07:00", endTime: "12:00", semesterId: activeSemesterId } })
    await db.facultyAvailability.create({ data: { facultyId: faculty.id, day, startTime: "13:00", endTime: "19:00", semesterId: activeSemesterId } })
  }
  if (cteBuildingId) {
    await db.facultyBuildingAvailability.create({ data: { facultyId: faculty.id, buildingId: cteBuildingId, semesterId: activeSemesterId } })
  }
}

/** Replicates the ADMIN branch of the generate route for one program, in-memory (no writes). */
async function simulateProgramGenerate(cteDeptId: string, scheduleSemesterId: string, semType: "FIRST" | "SECOND" | null, programId: string) {
  const roomScopeDeptId = cteDeptId
  const notAutoExcluded = { AND: ["NSTP", "NST", "PATHFIT", "PATHFit"].map((p) => ({ code: { not: { startsWith: p } } })) }
  const notGecFilter = { AND: ["GEC", "GEL"].map((p) => ({ code: { not: { startsWith: p } } })) }
  const semesterFilter = semType ? { semester: semType } : {}

  const subjectWhere: any = {
    OR: [
      { programId, ...semesterFilter },
      { programId: null, departmentId: cteDeptId, ...notGecFilter, ...notAutoExcluded },
    ],
  }

  const [subjects, faculty, rooms, sections] = await Promise.all([
    db.subject.findMany({ where: subjectWhere, include: { department: true } }),
    db.faculty.findMany({
      where: { isActive: true, OR: [{ departmentId: cteDeptId, programId }, { departmentId: cteDeptId, programId: null }] },
      include: { user: true, availability: { where: { semesterId: scheduleSemesterId } }, buildingAvailability: { where: { semesterId: scheduleSemesterId } } },
    }),
    db.room.findMany({
      where: {
        isActive: true,
        code: { notIn: PLACEHOLDER_ROOM_CODES },
        AND: [
          { building: { OR: [{ departments: { none: {} } }, { departments: { some: { departmentId: roomScopeDeptId } } }] } },
          {
            OR: [
              { AND: [{ departments: { none: {} } }, { programs: { none: {} } }] },
              { departments: { some: { departmentId: roomScopeDeptId } } },
              { programs: { some: { program: { departmentId: roomScopeDeptId } } } },
            ],
          },
        ],
      },
      include: { building: true, departments: true, programs: true },
    }),
    db.section.findMany({
      where: { yearLevel: { programId } },
      include: { yearLevel: { include: { program: { include: { department: { include: { college: { select: { abbreviation: true } } } } } } } } },
    }),
  ])

  function gecAllowedSectionIds(subj: any): string[] | null {
    if (subj.programId) return null
    if (!semType) return null
    const allowed: string[] = []
    for (const sec of sections as any[]) {
      const progAbbr = sec.yearLevel?.program?.abbreviation
      const yl = sec.yearLevel?.level
      if (!progAbbr || !yl) continue
      if (hasCurriculumMap(progAbbr)) {
        const codes = getCurriculumCodes(progAbbr, yl, semType)
        if (codes.some((c: string) => c.toLowerCase() === subj.code.toLowerCase())) allowed.push(sec.id)
      } else if (yl === (subj.year ?? 1) && (!subj.semester || subj.semester === semType)) {
        allowed.push(sec.id)
      }
    }
    return allowed
  }

  const subjectInputs = subjects.map((s: any) => ({
    id: s.id, code: s.code, title: s.title, hoursPerWeek: s.hoursPerWeek, type: s.type,
    requiredRoomType: resolveRequiredRoomTypes(s) as string[], units: s.units,
    departmentCode: s.department?.abbreviation, year: s.year ?? 1, programId: s.programId ?? null,
    requiredLabSpecialization: s.requiredLabSpecialization ?? null,
    allowedSectionIds: gecAllowedSectionIds(s), fixedAssignment: null,
  }))
  const facultyInputs = faculty.map((f: any) => ({
    id: f.id, name: `${f.user.firstName} ${f.user.lastName}`, specializations: f.specializations,
    sectionCounts: (f.sectionCounts as Record<string, number>) ?? {}, maxUnitsPerWeek: f.maxUnitsPerWeek, maxHoursPerWeek: f.maxHoursPerWeek ?? null,
    availability: f.availability.map((a: any) => ({ day: a.day, startTime: a.startTime, endTime: a.endTime })),
    allowedBuildingIds: f.buildingAvailability.map((b: any) => b.buildingId),
  }))
  const roomInputs = rooms.map((r: any) => {
    const deptEntries = r.departments ?? []
    const programEntries = r.programs ?? []
    const openToWholeDept = (deptEntries.length === 0 && programEntries.length === 0) || deptEntries.some((d: any) => d.departmentId === roomScopeDeptId)
    return { id: r.id, code: r.code, type: r.type, buildingId: r.building?.id ?? r.buildingId, buildingCode: r.building?.code, labSpecialization: r.labSpecialization ?? null, allowedProgramIds: openToWholeDept ? [] : programEntries.map((p: any) => p.programId) }
  })
  const sectionInputs = sections.map((s: any) => ({ id: s.id, name: s.name, yearLevel: s.yearLevel?.level ?? 1, programId: s.yearLevel?.programId ?? null, allowSaturday: s.yearLevel?.program?.department?.college?.abbreviation === "CAM" }))

  if (sectionInputs.length === 0 || roomInputs.length === 0) return { unassigned: [], subjectCount: subjectInputs.length }

  const engine = new SchedulingEngine(subjectInputs as any, facultyInputs as any, roomInputs as any, sectionInputs as any, {}, [])
  const result = await engine.generate()
  return { unassigned: result.unassigned, subjectCount: subjectInputs.length }
}

async function main() {
  const cte = await db.department.findFirstOrThrow({ where: { abbreviation: "CTE" } })
  const programs = await db.program.findMany({ where: { departmentId: cte.id }, select: { id: true, abbreviation: true } })
  if (programs.length === 0) throw new Error("No CTE programs found")

  const activeSemester =
    (await db.semester.findFirst({ where: { isActive: true }, include: { academicYear: true } })) ??
    (await db.semester.findFirst({ orderBy: { academicYear: { startYear: "desc" } }, include: { academicYear: true } }))
  if (!activeSemester) throw new Error("No semester exists — create an academic year/semester first")

  const anyChair = await db.user.findFirst({ where: { role: { in: ["SUPER_ADMIN", "DEAN"] }, isApproved: true }, select: { id: true } })
  if (!anyChair) throw new Error("No approved chair account exists to attribute the schedule to")

  let schedule = await db.schedule.findFirst({ where: { departmentId: cte.id, semesterId: activeSemester.id, isArchived: false } })
  if (!schedule) {
    schedule = await db.schedule.create({ data: { departmentId: cte.id, semesterId: activeSemester.id, createdBy: anyChair.id, status: "DRAFT" } })
    console.log(`Created Draft schedule for CTE — ${activeSemester.type} ${activeSemester.academicYear.label} (${schedule.id})`)
  } else {
    console.log(`Using existing CTE schedule for this term (${schedule.id}, status=${schedule.status})`)
  }

  // ── 1. Every non-GEC code the curriculum map calls for, this term, any program/year ──
  const neededByCode = new Map<string, Set<string>>()
  for (const p of programs) {
    if (!hasCurriculumMap(p.abbreviation)) { console.log(`!! no curriculum map for ${p.abbreviation} — skipping`); continue }
    for (let y = 1; y <= 4; y++) {
      for (const code of getCurriculumCodes(p.abbreviation, y, activeSemester.type as "FIRST" | "SECOND")) {
        if (/^(GEC|GEL|PATHFIT|NST)/i.test(code)) continue
        if (!neededByCode.has(code)) neededByCode.set(code, new Set())
        neededByCode.get(code)!.add(p.abbreviation)
      }
    }
  }

  const subjects = await db.subject.findMany({
    where: { departmentId: cte.id, code: { in: [...neededByCode.keys()], mode: "insensitive" } },
    select: { id: true, code: true, title: true, type: true, requiredRoomType: true, requiredLabSpecialization: true, programId: true },
  })
  const subjByCodeLower = new Map(subjects.map((s) => [s.code.toLowerCase(), s]))

  // ── 2. What's already covered ──
  const activeFaculty = await db.faculty.findMany({ where: { departmentId: cte.id, isActive: true }, select: { specializations: true } })
  const gaps: typeof subjects = []
  const missing: string[] = []
  for (const code of neededByCode.keys()) {
    const subj = subjByCodeLower.get(code.toLowerCase())
    if (!subj) { missing.push(code); continue }
    const covered = activeFaculty.some((f) => specializationsCoverSubject(f.specializations, subj.title, subj.code))
    if (!covered) gaps.push(subj)
  }
  console.log(`${neededByCode.size} distinct codes needed, ${gaps.length} uncovered${missing.length ? `, ${missing.length} with no subject row (${missing.join(", ")})` : ""}`)

  // ── 3. Room-type gap: CTEB needs at least one LABORATORY-capable room ──
  const cteBuilding = await db.building.findFirst({ where: { departments: { some: { departmentId: cte.id } } } })
  if (cteBuilding) {
    const needsLabRoom = gaps.some((s) => resolveRequiredRoomTypes(s as any).some((rt) => rt === "LABORATORY" || rt === "LECTURE_LAB" || rt === "COMPUTER_LAB"))
    const existingLabRoom = await db.room.findFirst({ where: { buildingId: cteBuilding.id, type: { in: ["LABORATORY", "LECTURE_LAB", "COMPUTER_LAB"] } } })
    if (needsLabRoom && !existingLabRoom) {
      const existingCodes = new Set((await db.room.findMany({ where: { buildingId: cteBuilding.id }, select: { code: true } })).map((r) => r.code))
      let added = 0
      for (let i = 1; i <= 4; i++) {
        const code = `CTE-L0${i}`
        if (existingCodes.has(code)) continue
        await db.room.create({ data: { name: `CTE Laboratory ${i}`, code, buildingId: cteBuilding.id, type: "LECTURE_LAB" } })
        added++
      }
      console.log(`Added ${added} LECTURE_LAB room(s) to ${cteBuilding.code} (previously had none)`)
    } else {
      console.log(existingLabRoom ? `${cteBuilding.code} already has a lab-capable room — no room added` : "No lab room needed")
    }
  }

  // ── 4. One dedicated faculty per gap ──
  let created = 0
  for (const subj of gaps) {
    const employeeId = `CTE-COVER-${subj.code.toUpperCase()}`
    if (await db.faculty.findUnique({ where: { employeeId } })) continue
    await createCoverageFaculty(cte.id, cteBuilding?.id, activeSemester.id, employeeId, subj.programId, `${subj.code} - ${subj.title}`)
    created++
  }
  console.log(`Created ${created} dedicated coverage faculty (${gaps.length - created} already existed)`)

  // ── 5. Self-verify via the real engine, top up any residual failures ──
  const semType = activeSemester.type as "FIRST" | "SECOND"
  for (let pass = 1; pass <= 3; pass++) {
    console.log(`\n--- Verification pass ${pass} ---`)
    let totalUnassigned = 0
    const residualCodes = new Set<string>()
    for (const p of programs) {
      const { unassigned, subjectCount } = await simulateProgramGenerate(cte.id, schedule.semesterId, semType, p.id)
      totalUnassigned += unassigned.length
      console.log(`  ${p.abbreviation.padEnd(10)} subjects:${subjectCount} unassigned:${unassigned.length}`)
      for (const u of unassigned) {
        console.log(`      - ${u.subjectCode} / ${u.sectionName}: ${u.reason}`)
        residualCodes.add(u.subjectCode)
      }
    }
    if (totalUnassigned === 0) {
      console.log(`\nAll CTE programs verified with ZERO unassigned subjects.`)
      break
    }
    if (pass === 3) {
      console.log(`\n!! Still ${totalUnassigned} unassigned after ${pass} passes — manual follow-up needed for: ${[...residualCodes].join(", ")}`)
      break
    }
    console.log(`Topping up dedicated backup faculty for: ${[...residualCodes].join(", ")}`)
    for (const code of residualCodes) {
      const subj = await db.subject.findFirst({ where: { code: { equals: code, mode: "insensitive" }, departmentId: cte.id } })
      if (!subj) continue
      const employeeId = `CTE-COVER${pass + 1}-${subj.code.toUpperCase()}`
      if (await db.faculty.findUnique({ where: { employeeId } })) continue
      await createCoverageFaculty(cte.id, cteBuilding?.id, activeSemester.id, employeeId, subj.programId, `${subj.code} - ${subj.title}`)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
