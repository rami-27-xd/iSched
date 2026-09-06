// 1. Remove the extra B/C sections added for testing (they were added prematurely)
//    This reduces tasks from 252 to 84 (84 subjects × 1 section per year level)
// 2. Add 10 more BSIT faculty so the unit budget is enough:
//    84 tasks × avg 3 units = 252 total units / 21 per faculty = 12 faculty minimum
//    We'll add 10 more (total 22) for comfortable margin.
import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const
const TIME_BLOCKS = [
  { start: '07:00', end: '10:00' },
  { start: '08:00', end: '11:00' },
  { start: '09:00', end: '12:00' },
  { start: '10:00', end: '13:00' },
  { start: '12:00', end: '15:00' },
  { start: '13:00', end: '16:00' },
  { start: '14:00', end: '17:00' },
  { start: '07:00', end: '12:00' },
  { start: '13:00', end: '18:00' },
]

function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, n)
}

const MORE_FACULTY = [
  { firstName: 'Jonathan', lastName: 'Rivera' },
  { firstName: 'Maribel', lastName: 'Torres' },
  { firstName: 'Ferdinand', lastName: 'Navarro' },
  { firstName: 'Gloria', lastName: 'Pascual' },
  { firstName: 'Renato', lastName: 'Ocampo' },
  { firstName: 'Cecilia', lastName: 'Castillo' },
  { firstName: 'Ariel', lastName: 'Morales' },
  { firstName: 'Teresita', lastName: 'Espiritu' },
  { firstName: 'Eduardo', lastName: 'Dimaculangan' },
  { firstName: 'Felicitas', lastName: 'Macapagal' },
]

async function main() {
  // Step 1: Remove extra B and C sections (keep only A)
  const deleted = await db.section.deleteMany({
    where: { id: { startsWith: 'bsit-yl' } },
  })
  console.log(`Deleted ${deleted.count} extra sections (B and C)`)

  // Verify remaining sections
  const bsit = await db.program.findFirst({ where: { name: 'BS Information Technology' } })
  const remainingSections = await db.section.count({ where: { yearLevel: { programId: bsit?.id } } })
  console.log(`Remaining BSIT sections: ${remainingSections} (should be 4)`)

  // Step 2: Resolve CIT dept and active semester
  const citDept = await db.department.findFirst({ where: { abbreviation: 'CIT' } })
  let semester = await db.semester.findFirst({ where: { isActive: true } })
  if (!semester) {
    semester = await db.semester.findFirst({ orderBy: { createdAt: 'desc' } })
  }
  console.log(`Semester: ${semester?.id}`)

  // Step 3: Add 10 more BSIT faculty with broad availability
  for (const person of MORE_FACULTY) {
    const employeeId = `EMP-CIT-X-${Date.now()}-${Math.floor(Math.random() * 9999)}`
    const stubEmail = `${employeeId.toLowerCase().replace(/[^a-z0-9]/g, '')}@faculty.slsu.edu.ph`

    const user = await db.user.create({
      data: {
        supabaseId: `manual-${employeeId}`,
        email: stubEmail,
        firstName: person.firstName,
        lastName: person.lastName,
        role: 'FACULTY',
        isApproved: true,
        departmentId: citDept?.id,
      },
    })

    const faculty = await db.faculty.create({
      data: {
        userId: user.id,
        departmentId: citDept?.id ?? '',
        programId: bsit?.id,
        employeeId,
        maxUnitsPerWeek: 21,
        isActive: true,
      },
    })

    // Generous availability: 5-6 days, 2 time blocks per day
    const availDays = pickN(DAYS as unknown as string[], 5 + Math.floor(Math.random() * 2))
    for (const day of availDays) {
      const blocks = pickN(TIME_BLOCKS, 2)
      for (const block of blocks) {
        await db.facultyAvailability.upsert({
          where: {
            facultyId_day_startTime_semesterId: {
              facultyId: faculty.id,
              day: day as any,
              startTime: block.start,
              semesterId: semester!.id,
            },
          },
          update: { endTime: block.end },
          create: {
            facultyId: faculty.id,
            day: day as any,
            startTime: block.start,
            endTime: block.end,
            semesterId: semester!.id,
          },
        })
      }
    }
    console.log(`  + ${person.firstName} ${person.lastName} (${availDays.length} days)`)
  }

  // Final state
  const totalFaculty = await db.faculty.count({ where: { programId: bsit?.id, isActive: true } })
  const subjects = await db.subject.count({
    where: { OR: [{ programId: bsit?.id }, { programId: null, departmentId: citDept?.id }] },
  })
  console.log(`\nReady: ${totalFaculty} faculty | ${remainingSections} sections | ${subjects} subjects`)
  console.log(`Task count: ${subjects} subjects x ${remainingSections} sections = ${subjects * remainingSections} tasks`)
  console.log(`Capacity:   ${totalFaculty} faculty x 21 units = ${totalFaculty * 21} units (need ~${subjects * 3})`)
}

main().finally(() => db.$disconnect())
