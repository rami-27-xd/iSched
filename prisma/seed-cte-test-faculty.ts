/**
 * Test data for CTE: random faculty + specializations + per-term availability +
 * building access, plus the Draft schedule that per-term availability now
 * requires (see CLAUDE.md "Faculty Availability Page Notes").
 *
 * For each CTE faculty created:
 *   - a stub User (role FACULTY, "manual-" supabaseId — cannot sign in)
 *   - a Faculty row assigned to one CTE program, with 2-4 specializations drawn
 *     from that program's REAL subject titles (so generation/manual entry can
 *     actually match them under the strict no-exemption rule)
 *   - Mon–Fri availability for the ACTIVE semester (07:30–17:00, minus a
 *     lunch/random gap so the timeline isn't a suspiciously solid block)
 *   - building access to CTEB (the one building already mapped to CTE)
 *
 * Idempotent-ish: re-running adds MORE faculty (employeeId is timestamped), it
 * does not dedupe against a previous run — delete rows by department first if
 * you want a clean slate.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-cte-test-faculty.ts [count]
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const FIRST_NAMES = ["Maria", "Jose", "Ana", "Carlos", "Elena", "Ramon", "Teresa", "Miguel", "Rosario", "Antonio", "Carmen", "Rodrigo", "Luz", "Fernando", "Corazon"]
const LAST_NAMES = ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Mercado", "Villanueva", "Aquino", "Torres", "Ramos", "Garcia", "Fernandez", "Del Rosario", "Pascual", "Navarro"]
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function pickN<T>(arr: T[], n: number): T[] {
  const pool = [...arr]
  const out: T[] = []
  while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return out
}

async function main() {
  const count = Number(process.argv[2] ?? 10) || 10

  const cte = await db.department.findFirstOrThrow({ where: { abbreviation: "CTE" } })
  const programs = await db.program.findMany({ where: { departmentId: cte.id }, select: { id: true, abbreviation: true } })
  if (programs.length === 0) throw new Error("No CTE programs found")

  // Real subject titles per program (major subjects only — programId set) so a
  // specialization tag is something the generator/manual entry can actually match.
  const subjectsByProgram = new Map<string, string[]>()
  for (const p of programs) {
    const subs = await db.subject.findMany({ where: { departmentId: cte.id, programId: p.id }, select: { title: true } })
    subjectsByProgram.set(p.id, subs.map((s) => s.title))
  }
  // Dept-wide shared CTE subjects (programId null) — PED01, FS001, etc. Any CTE
  // faculty can plausibly be tagged for one of these too.
  const sharedSubjects = (
    await db.subject.findMany({ where: { departmentId: cte.id, programId: null }, select: { title: true } })
  ).map((s) => s.title)

  const activeSemester =
    (await db.semester.findFirst({ where: { isActive: true }, include: { academicYear: true } })) ??
    (await db.semester.findFirst({ orderBy: { academicYear: { startYear: "desc" } }, include: { academicYear: true } }))
  if (!activeSemester) throw new Error("No semester exists — create an academic year/semester first")

  // Availability (and the schedule below) needs *a* signed-in user as createdBy.
  // Reuse any approved chair — this seed is test data, not a real workflow action.
  const anyChair = await db.user.findFirst({ where: { role: { in: ["SUPER_ADMIN", "DEAN"] }, isApproved: true }, select: { id: true } })
  if (!anyChair) throw new Error("No approved chair account exists to attribute the schedule to")

  // A non-archived schedule for CTE in the active term — required by the
  // per-term availability rule (POST /api/faculty/availability 409s without one).
  let schedule = await db.schedule.findFirst({
    where: { departmentId: cte.id, semesterId: activeSemester.id, isArchived: false },
  })
  if (!schedule) {
    schedule = await db.schedule.create({
      data: { departmentId: cte.id, semesterId: activeSemester.id, createdBy: anyChair.id, status: "DRAFT" },
    })
    console.log(`Created Draft schedule for CTE — ${activeSemester.type} ${activeSemester.academicYear.label} (${schedule.id})`)
  } else {
    console.log(`Using existing CTE schedule for this term (${schedule.id}, status=${schedule.status})`)
  }

  const cteBuilding = await db.building.findFirst({ where: { departments: { some: { departmentId: cte.id } } } })

  const created: string[] = []
  for (let i = 0; i < count; i++) {
    const program = pick(programs)
    const firstName = pick(FIRST_NAMES)
    const lastName = pick(LAST_NAMES)
    const stamp = Date.now().toString(36) + i
    const employeeId = `CTE-TEST-${stamp}`

    const user = await db.user.create({
      data: {
        supabaseId: `manual-${stamp}`,
        email: null,
        firstName,
        lastName,
        role: "FACULTY",
        isApproved: true,
        isActive: true,
        departmentId: cte.id,
      },
    })

    const programTitles = subjectsByProgram.get(program.id) ?? []
    const pool = programTitles.length >= 2 ? programTitles : [...programTitles, ...sharedSubjects]
    const specCount = Math.min(pool.length, 2 + Math.floor(Math.random() * 3)) // 2–4
    const specializations = pickN(pool, specCount)

    const faculty = await db.faculty.create({
      data: {
        userId: user.id,
        departmentId: cte.id,
        programId: program.id,
        employeeId,
        specializations,
        maxUnitsPerWeek: 21,
        maxHoursPerWeek: 30,
      },
    })

    // Mon–Fri availability for the active term, with a lunch break and one
    // random extra gap so faculty don't all look identically wide open.
    for (const day of DAYS) {
      const skipAfternoon = Math.random() < 0.25 // some are morning-only
      await db.facultyAvailability.create({
        data: { facultyId: faculty.id, day, startTime: "07:30", endTime: "12:00", semesterId: activeSemester.id },
      })
      if (!skipAfternoon) {
        await db.facultyAvailability.create({
          data: { facultyId: faculty.id, day, startTime: "13:00", endTime: "17:00", semesterId: activeSemester.id },
        })
      }
    }

    if (cteBuilding) {
      await db.facultyBuildingAvailability.create({
        data: { facultyId: faculty.id, buildingId: cteBuilding.id, semesterId: activeSemester.id },
      })
    }

    created.push(`${firstName} ${lastName} (${program.abbreviation}) — ${specializations.length} spec(s)`)
  }

  console.log(`\nCreated ${created.length} CTE test faculty for ${activeSemester.type} ${activeSemester.academicYear.label}:`)
  created.forEach((c) => console.log(`  ${c}`))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
