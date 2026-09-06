import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

async function main() {
  const citDept = await db.department.findFirst({ where: { abbreviation: 'CIT' } })
  console.log('CIT dept:', citDept?.id?.slice(-6), citDept?.name)

  // What subjects have programId=null AND departmentId=CIT?  (the "dept-wide" pool ADMIN gets)
  const deptWide = await db.subject.findMany({
    where: { programId: null, departmentId: citDept?.id },
    select: { code: true, title: true, year: true },
    orderBy: { code: 'asc' },
  })
  console.log(`\nSubjects with programId=null AND departmentId=CIT (${deptWide.length}):`)
  deptWide.forEach((s: any) => console.log(` ${s.code} y${s.year} — ${s.title}`))

  // Check FLO specifically
  const flo = await db.subject.findFirst({
    where: { code: { startsWith: 'FLO' } },
    include: { department: true, program: true },
  })
  console.log('\nFLO01:', (flo as any)?.code, '| dept:', (flo as any)?.department?.abbreviation, '| programId:', (flo as any)?.programId ?? 'NULL')
}
main().catch(console.error).finally(() => db.$disconnect())
