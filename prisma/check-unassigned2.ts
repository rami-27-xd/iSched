import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

async function main() {
  const bsit = await db.program.findFirst({ where: { name: { contains: 'Information Technology' } } }) as any
  const deptId = bsit?.departmentId

  // All Year-3 subjects that ADMIN would load
  const GEC = ['GEC','GEL','PATHFIT','PATHFit','NST']
  const y3subjects = await db.subject.findMany({
    where: {
      year: 3,
      OR: [
        { programId: bsit?.id },
        { programId: null, departmentId: deptId, AND: GEC.map(p => ({ code: { not: { startsWith: p } } })) },
      ],
    },
    select: { code: true, title: true, hoursPerWeek: true, type: true },
    orderBy: { code: 'asc' },
  }) as any[]
  
  const totalHours = y3subjects.reduce((s: number, x: any) => s + (x.hoursPerWeek ?? 0), 0)
  console.log(`Year-3 subjects (ADMIN scope): ${y3subjects.length} = ${totalHours} total hours/week`)
  y3subjects.forEach((s: any) => console.log(` ${s.code} ${s.hoursPerWeek}h ${s.type}`))
  console.log(`\nWeekly capacity (1 section, 07:00-20:00, 6 days): ${6 * 13} hours`)
  console.log(`Overflow: ${totalHours - 6 * 13} hours`)
}
main().catch(console.error).finally(() => db.$disconnect())
