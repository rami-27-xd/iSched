import { db } from '../lib/db'

async function main() {
  const byDept = await db.subject.groupBy({
    by: ['departmentId'],
    _count: { id: true },
  })
  const depts = await db.department.findMany({ select: { id: true, abbreviation: true } })
  const deptMap = Object.fromEntries(depts.map(d => [d.id, d.abbreviation]))
  for (const row of byDept) {
    console.log(`${deptMap[row.departmentId] ?? row.departmentId}: ${row._count.id} subjects`)
  }
}
main().catch(console.error).finally(() => db.$disconnect())
