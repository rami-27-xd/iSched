/**
 * seed-test-data.ts
 * Creates enough test faculty, rooms, and availability so the scheduling
 * engine can assign ALL subjects across all departments in one run.
 *
 * Design targets:
 *   - 30 test faculty per department, maxUnitsPerWeek=150 each
 *   - Full-day availability (07:00–20:00) on all 6 days
 *   - Availability seeded for EVERY semester in the database
 *   - 40 lecture rooms, 20 labs, 15 computer labs, 10 lecture labs
 *   - One unrestricted "Test Building" (no DepartmentBuilding rows)
 *
 * Run: npx tsx prisma/seed-test-data.ts
 */
import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' })
const db = new PrismaClient({ adapter })

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const

// Single wide window per day: covers any session duration and
// allows getCommonAvailableTimes() to find slots across all day patterns.
const DAILY_WINDOW = { start: '06:00', end: '22:00' }

const FACULTY_NAMES = [
  { firstName: 'Maria',      lastName: 'Alvarez' },
  { firstName: 'Jose',       lastName: 'Reyes' },
  { firstName: 'Luz',        lastName: 'Santiago' },
  { firstName: 'Ramon',      lastName: 'Dela Rosa' },
  { firstName: 'Cecilia',    lastName: 'Torres' },
  { firstName: 'Eduardo',    lastName: 'Navarro' },
  { firstName: 'Rosario',    lastName: 'Mendoza' },
  { firstName: 'Danilo',     lastName: 'Espinosa' },
  { firstName: 'Felicitas',  lastName: 'Aguilar' },
  { firstName: 'Renato',     lastName: 'Pascual' },
  { firstName: 'Gloria',     lastName: 'Ramos' },
  { firstName: 'Andres',     lastName: 'Villanueva' },
  { firstName: 'Milagros',   lastName: 'Castro' },
  { firstName: 'Bernardo',   lastName: 'Ocampo' },
  { firstName: 'Leonida',    lastName: 'Bautista' },
  { firstName: 'Rodrigo',    lastName: 'Fernandez' },
  { firstName: 'Carmelita',  lastName: 'Buenaventura' },
  { firstName: 'Marcelo',    lastName: 'Ilagan' },
  { firstName: 'Norma',      lastName: 'Crisostomo' },
  { firstName: 'Arturo',     lastName: 'Quiambao' },
  { firstName: 'Resurreccion', lastName: 'Lacson' },
  { firstName: 'Herminia',   lastName: 'Cabral' },
  { firstName: 'Wilfredo',   lastName: 'Pineda' },
  { firstName: 'Pacita',     lastName: 'Magpayo' },
  { firstName: 'Simplicio',  lastName: 'Domingo' },
  { firstName: 'Visitacion', lastName: 'Bartolome' },
  { firstName: 'Genaro',     lastName: 'Sevilla' },
  { firstName: 'Teofista',   lastName: 'Avelino' },
  { firstName: 'Cornelio',   lastName: 'Delos Reyes' },
  { firstName: 'Adoracion',  lastName: 'Manalastas' },
]

async function seedBuilding() {
  const building = await db.building.upsert({
    where: { code: 'TEST-BLDG' },
    update: { isActive: true },
    create: { name: 'Test Building', code: 'TEST-BLDG', isActive: true },
  })
  console.log(`Building: ${building.name} (${building.id})`)
  return building
}

async function seedRooms(buildingId: string) {
  const rooms: { name: string; code: string; type: string }[] = []

  for (let i = 1; i <= 40; i++)
    rooms.push({ name: `Test Lecture Room ${i}`, code: `TEST-LEC-${i}`, type: 'LECTURE_ROOM' })
  for (let i = 1; i <= 20; i++)
    rooms.push({ name: `Test Laboratory ${i}`, code: `TEST-LAB-${i}`, type: 'LABORATORY' })
  for (let i = 1; i <= 15; i++)
    rooms.push({ name: `Test Computer Lab ${i}`, code: `TEST-CL-${i}`, type: 'COMPUTER_LAB' })
  for (let i = 1; i <= 10; i++)
    rooms.push({ name: `Test Lecture Lab ${i}`, code: `TEST-LL-${i}`, type: 'LECTURE_LAB' })

  let created = 0
  for (const r of rooms) {
    await db.room.upsert({
      where: { code: r.code },
      update: { isActive: true },
      create: { name: r.name, code: r.code, buildingId, type: r.type as any, isActive: true, equipment: [] },
    })
    created++
  }
  console.log(`Rooms: ${created} upserted in Test Building`)
  return created
}

async function ensureAvailability(
  facultyId: string,
  semesterIds: string[],
  buildingId: string
) {
  // Remove any stale windows with a different start time (e.g. old 07:00 records when
  // DAILY_WINDOW.start is now 06:00) so there is always exactly one window per day.
  await db.facultyAvailability.deleteMany({
    where: { facultyId, startTime: { not: DAILY_WINDOW.start } },
  })

  for (const semesterId of semesterIds) {
    // One wide window per day per semester — the scheduler can fit any session inside it
    for (const day of DAYS) {
      await db.facultyAvailability.upsert({
        where: {
          facultyId_day_startTime_semesterId: {
            facultyId, day: day as any, startTime: DAILY_WINDOW.start, semesterId,
          },
        },
        update: { endTime: DAILY_WINDOW.end },
        create: {
          facultyId, day: day as any,
          startTime: DAILY_WINDOW.start, endTime: DAILY_WINDOW.end, semesterId,
        },
      })
    }
    // Building availability for the test building
    await db.facultyBuildingAvailability.upsert({
      where: { facultyId_buildingId_semesterId: { facultyId, buildingId, semesterId } },
      update: {},
      create: { facultyId, buildingId, semesterId },
    })
  }
}

async function seedFacultyForDept(
  deptId: string,
  deptAbbr: string,
  semesterIds: string[],
  buildingId: string,
) {
  let added = 0
  let updated = 0
  for (const person of FACULTY_NAMES) {
    const employeeId = `TEST-${deptAbbr}-${person.lastName.toUpperCase().replace(/\s+/g, '')}`

    const existing = await db.faculty.findFirst({ where: { employeeId } })
    if (existing) {
      // Ensure availability is up-to-date for all semesters
      await ensureAvailability(existing.id, semesterIds, buildingId)
      updated++
      continue
    }

    const stubEmail = `${employeeId.toLowerCase().replace(/[^a-z0-9]/g, '')}@testfaculty.slsu.edu.ph`
    const user = await db.user.create({
      data: {
        supabaseId: `manual-${employeeId}`,
        email: stubEmail,
        firstName: person.firstName,
        lastName: person.lastName,
        role: 'FACULTY',
        isApproved: true,
        isActive: true,
        departmentId: deptId,
      },
    })

    const faculty = await db.faculty.create({
      data: {
        userId: user.id,
        departmentId: deptId,
        employeeId,
        maxUnitsPerWeek: 150,
        isActive: true,
        specializations: [],
      },
    })

    await ensureAvailability(faculty.id, semesterIds, buildingId)
    added++
  }

  console.log(`  ${deptAbbr}: ${added} new + ${updated} updated (${FACULTY_NAMES.length} total test faculty)`)
}

async function main() {
  // Load ALL semesters — seed availability for each so the schedule semester never matters
  const semesters = await db.semester.findMany({ include: { academicYear: true } })
  if (semesters.length === 0) {
    console.error('No semesters found — create at least one semester first')
    process.exit(1)
  }
  const semesterIds = semesters.map((s: any) => s.id)
  console.log(`Seeding for ${semesterIds.length} semester(s):`)
  semesters.forEach((s: any) =>
    console.log(`  ${s.academicYear?.label ?? s.id} ${s.type}${s.isActive ? ' [ACTIVE]' : ''}`)
  )

  const building = await seedBuilding()
  const roomCount = await seedRooms(building.id)
  console.log(`Total rooms in Test Building: ${roomCount}`)

  const departments = await db.department.findMany({
    select: { id: true, name: true, abbreviation: true },
  })
  console.log(`\nSeeding ${FACULTY_NAMES.length} test faculty for ${departments.length} departments...`)

  for (const dept of departments as any[]) {
    await seedFacultyForDept(
      dept.id,
      dept.abbreviation ?? dept.name.replace(/\s+/g, '').slice(0, 8),
      semesterIds,
      building.id,
    )
  }

  console.log('\nDone. Each test faculty:')
  console.log('  • maxUnitsPerWeek = 150 (fits ~50 three-unit subjects)')
  console.log(`  • availability ${DAILY_WINDOW.start}–${DAILY_WINDOW.end} on all 6 days, for every semester`)
  console.log('  • building availability for Test Building')
  console.log('\nRe-run schedule generation — all subjects should now be assigned.')
}

main().catch(console.error).finally(() => (db as any).$disconnect())
