import { db } from '../lib/db'

async function main() {
  const depts = await db.department.findMany({ include: { college: true } })
  for (const d of depts) {
    console.log(`${d.id} | ${d.abbreviation} | ${d.name} | college: ${d.college?.abbreviation}`)
  }
}
main().catch(console.error).finally(() => db.$disconnect())
