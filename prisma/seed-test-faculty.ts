import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' })
const db = new PrismaClient({ adapter })

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const
const TIME_BLOCKS = [
  { start: '07:00', end: '09:00' },
  { start: '07:00', end: '10:00' },
  { start: '07:30', end: '10:30' },
  { start: '08:00', end: '11:00' },
  { start: '09:00', end: '12:00' },
  { start: '10:00', end: '13:00' },
  { start: '12:00', end: '15:00' },
  { start: '13:00', end: '16:00' },
  { start: '14:00', end: '17:00' },
  { start: '15:00', end: '18:00' },
  { start: '07:00', end: '12:00' },
  { start: '13:00', end: '18:00' },
]

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, n)
}

const FACULTY_DATA = [
  { firstName: 'Ana', lastName: 'Reyes' },
  { firstName: 'Carlos', lastName: 'Mendoza' },
  { firstName: 'Elena', lastName: 'Garcia' },
  { firstName: 'Roberto', lastName: 'Cruz' },
  { firstName: 'Lourdes', lastName: 'Santos' },
  { firstName: 'Danilo', lastName: 'Bautista' },
  { firstName: 'Maricel', lastName: 'Flores' },
  { firstName: 'Jerome', lastName: 'Villanueva' },
  { firstName: 'Cristina', lastName: 'Aquino' },
  { firstName: 'Rodel', lastName: 'Dela Cruz' },
]

async function main() {
  // Find CIT department
  const citDept = await db.department.findFirst({
    where: { abbreviation: 'CIT' },
  })
  if (!citDept) {
    console.error('CIT department not found')
    process.exit(1)
  }
  console.log(`Found CIT dept: ${citDept.id}`)

  // Find active (or most recent) semester
  let semester = await db.semester.findFirst({ where: { isActive: true } })
  if (!semester) {
    semester = await db.semester.findFirst({
      include: { academicYear: true },
      orderBy: { createdAt: 'desc' },
    })
  }
  if (!semester) { console.error('No semester found'); process.exit(1) }
  console.log(`Using semester: ${(semester as any).academicYear?.label ?? semester.id}`)

  for (const person of FACULTY_DATA) {
    const employeeId = `EMP-CIT-${Date.now()}-${Math.floor(Math.random() * 9999)}`

    // Create stub user (no real email — uses system placeholder matching app convention)
    const stubEmail = `${employeeId.toLowerCase().replace(/[^a-z0-9]/g, '')}@faculty.slsu.edu.ph`
    const user = await db.user.create({
      data: {
        supabaseId: `manual-${employeeId}`,
        email: stubEmail,
        firstName: person.firstName,
        lastName: person.lastName,
        role: 'FACULTY',
        isApproved: true,
        departmentId: citDept.id,
      },
    })

    const faculty = await db.faculty.create({
      data: {
        userId: user.id,
        departmentId: citDept.id,
        employeeId,
        maxUnitsPerWeek: 21,
        isActive: true,
      },
    })

    // Randomized availability: 3–5 days, 1–2 time blocks per day
    const availDays = pickN(DAYS as unknown as string[], Math.floor(Math.random() * 3) + 3)
    for (const day of availDays) {
      const numBlocks = Math.random() > 0.5 ? 2 : 1
      const blocks = pickN(TIME_BLOCKS, numBlocks)
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

    console.log(`✓ ${person.firstName} ${person.lastName} — ${availDays.length} available days`)
  }

  console.log('\nDone! All test faculty added.')
}

main().finally(() => db.$disconnect())
