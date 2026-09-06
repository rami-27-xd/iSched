import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

async function main() {
  // How are BIO subjects stored?
  const bios = await db.subject.findMany({
    where: { code: { startsWith: 'BIO' } },
    include: {
      department: { select: { abbreviation: true, name: true } },
      program: { select: { abbreviation: true, name: true, department: { select: { abbreviation: true } } } },
    },
    take: 10,
  })
  console.log('BIO subjects:')
  bios.forEach((s: any) => console.log(
    ` ${s.code} | year:${s.year} | dept:${s.department?.abbreviation} | program:${s.program?.abbreviation ?? 'NULL'} | prog.dept:${s.program?.department?.abbreviation ?? 'N/A'}`
  ))

  // What is the latest schedule's departmentId, and what subjects does SUPER_ADMIN generation load?
  const sched = await db.schedule.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, departmentId: true, status: true } })
  console.log('\nLatest schedule:', sched?.id?.slice(-6), 'status:', sched?.status, 'deptId:', sched?.departmentId?.slice(-6))

  // What subjects would SUPER_ADMIN load for this deptId?
  const deptSubjects = await db.subject.findMany({
    where: { departmentId: sched?.departmentId! },
    select: { code: true, programId: true, year: true },
    orderBy: { code: 'asc' },
    take: 20,
  })
  console.log('\nSample subjects in schedule dept:')
  deptSubjects.forEach((s: any) => console.log(` ${s.code} y${s.year} | progId:${s.programId?.slice(-6) ?? 'NULL'}`))

  // What sections does SUPER_ADMIN load for this deptId?
  const deptSections = await db.section.findMany({
    where: { yearLevel: { program: { departmentId: sched?.departmentId! } } },
    include: { yearLevel: { include: { program: { select: { abbreviation: true, departmentId: true } } } } },
  })
  console.log('\nSections in schedule dept:')
  deptSections.forEach((s: any) => console.log(
    ` ${s.name} | program:${s.yearLevel?.program?.abbreviation} | prog.deptId:${s.yearLevel?.program?.departmentId?.slice(-6)}`
  ))
}
main().catch(console.error).finally(() => db.$disconnect())
