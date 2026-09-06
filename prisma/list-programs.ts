import { db } from '../lib/db'

async function main() {
  const programs = await db.program.findMany({ include: { department: true } })
  for (const p of programs) {
    console.log(`${p.id} | ${p.abbreviation} | ${p.name} | dept: ${p.department?.abbreviation}`)
  }
}
main().catch(console.error).finally(() => db.$disconnect())
