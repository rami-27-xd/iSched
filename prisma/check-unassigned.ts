import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

async function main() {
  const codes = ['ITE25', 'RES01a', 'ITE18']
  for (const code of codes) {
    const s = await db.subject.findFirst({
      where: { code },
      include: { department: true, program: true },
    }) as any
    if (!s) { console.log(code, '— NOT FOUND'); continue }
    console.log(`${s.code} | year:${s.year} | type:${s.type} | hours:${s.hoursPerWeek} | units:${s.units} | roomType:[${s.requiredRoomType}] | labSpec:${s.requiredLabSpecialization ?? 'none'} | programId:${s.programId?.slice(-6) ?? 'NULL'} | dept:${s.department?.abbreviation}`)
  }

  // How many Year-3 sections exist for BSInfoTech?
  const bsit = await db.program.findFirst({ where: { name: { contains: 'Information Technology' } } }) as any
  const y3sections = await db.section.findMany({
    where: { yearLevel: { level: 3, programId: bsit?.id } },
    select: { id: true, name: true },
  })
  console.log(`\nBSInfoTech Year-3 sections: ${y3sections.length}`, y3sections.map((s: any) => s.name))

  // How many Year-3 subjects total?
  const y3subj = await db.subject.count({ where: { year: 3, programId: bsit?.id } })
  const y3subjNull = await db.subject.count({
    where: { year: 3, programId: null, departmentId: bsit?.departmentId ?? undefined },
  })
  console.log(`BSInfoTech Year-3 subjects: ${y3subj} (program-specific) + ${y3subjNull} (dept-wide non-GEC)`)

  // Active semester
  const sem = await db.semester.findFirst({ where: { isActive: true }, include: { academicYear: true } }) as any
  console.log(`\nActive semester: ${sem?.academicYear?.label} ${sem?.type} (id: ${sem?.id?.slice(-6)})`)

  // Faculty count with availability in that semester
  const deptId = bsit?.departmentId
  const facWithAvail = await db.faculty.count({
    where: { departmentId: deptId, isActive: true, availability: { some: { semesterId: sem?.id } } },
  })
  console.log(`CIT faculty with availability this semester: ${facWithAvail}`)
}
main().catch(console.error).finally(() => db.$disconnect())
