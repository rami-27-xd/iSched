// Diagnoses what's blocking schedule generation for BSIT
import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

async function main() {
  const SCHEDULE_ID = 'cmqnp93um0000y0vu37p1t8u0'
  const schedule = await db.schedule.findUnique({ where: { id: SCHEDULE_ID }, include: { semester: { include: { academicYear: true } } } })
  console.log('Schedule semester:', (schedule?.semester as any)?.academicYear?.label, schedule?.semester?.type, 'id:', schedule?.semesterId)

  const bsit = await db.program.findFirst({ where: { name: 'BS Information Technology' } })
  const citDept = await db.department.findFirst({ where: { abbreviation: 'CIT' } })

  // Subjects
  const subjects = await db.subject.findMany({
    where: { OR: [{ programId: bsit?.id }, { programId: null, departmentId: citDept?.id }] },
    orderBy: [{ year: 'asc' }, { code: 'asc' }],
  })
  console.log(`\nSubjects: ${subjects.length} total`)

  const roomTypes = subjects.reduce((acc: any, s: any) => {
    const key = s.requiredRoomType.length ? s.requiredRoomType.join(',') : 'ANY'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  console.log('  By requiredRoomType:', JSON.stringify(roomTypes))

  const labSpecs = subjects.reduce((acc: any, s: any) => {
    const key = s.requiredLabSpecialization ?? 'none'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  console.log('  By requiredLabSpecialization:', JSON.stringify(labSpecs))

  // Rooms
  const rooms = await db.room.findMany({ where: { isActive: true }, include: { building: true } })
  console.log(`\nRooms: ${rooms.length}`)
  const roomTypeCount = rooms.reduce((acc: any, r: any) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc }, {})
  console.log('  By type:', JSON.stringify(roomTypeCount))
  const roomSpecCount = rooms.reduce((acc: any, r: any) => { const k = r.labSpecialization ?? 'none'; acc[k] = (acc[k] ?? 0) + 1; return acc }, {})
  console.log('  By labSpecialization:', JSON.stringify(roomSpecCount))

  // Faculty & availability
  const faculty = await db.faculty.findMany({
    where: { programId: bsit?.id, isActive: true },
    include: {
      user: true,
      availability: { where: { semesterId: schedule?.semesterId } },
    },
  })
  console.log(`\nFaculty: ${faculty.length} total`)
  faculty.forEach((f: any) => {
    console.log(`  ${f.user.firstName} ${f.user.lastName}: ${f.availability.length} availability slots (spec: ${f.specializations.join(', ') || 'none'})`)
  })

  // Sections
  const sections = await db.section.findMany({ where: { yearLevel: { programId: bsit?.id } }, include: { yearLevel: true } })
  console.log(`\nSections: ${sections.length}`)
  sections.forEach((s: any) => console.log(`  ${s.name} (year ${s.yearLevel.level})`))

  // Check which subjects would have NO eligible faculty (empty specializations = all faculty eligible)
  const subjectsWithLabSpec = subjects.filter((s: any) => s.requiredLabSpecialization)
  console.log(`\n${subjectsWithLabSpec.length} subjects with requiredLabSpecialization:`)
  for (const s of subjectsWithLabSpec.slice(0, 10)) {
    const matchingRooms = rooms.filter((r: any) => r.labSpecialization === (s as any).requiredLabSpecialization)
    console.log(`  ${(s as any).code} (needs ${(s as any).requiredLabSpecialization}) → ${matchingRooms.length} matching rooms`)
  }

  // Check the subjects with a requiredRoomType that has NO matching rooms
  const subjectsNoRoom = subjects.filter((s: any) => {
    if ((s as any).requiredRoomType.length === 0) return false
    return !(rooms.some((r: any) => (s as any).requiredRoomType.includes(r.type)))
  })
  console.log(`\nSubjects with requiredRoomType but NO matching room: ${subjectsNoRoom.length}`)
  subjectsNoRoom.slice(0, 5).forEach((s: any) => console.log(`  ${s.code} needs: ${s.requiredRoomType.join(',')}`))
}

main().finally(() => db.$disconnect())
