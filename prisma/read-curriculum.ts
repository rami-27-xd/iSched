import 'dotenv/config'
import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const colleges = await db.college.findMany({
    include: {
      departments: {
        include: {
          programs: { include: { yearLevels: { include: { sections: true }, orderBy: { level: 'asc' } } } },
          subjects: { orderBy: [{ year: 'asc' }, { code: 'asc' }] },
        }
      }
    }
  })
  for (const c of colleges) {
    console.log(`\nCOLLEGE: ${c.name} (${c.abbreviation})`)
    for (const d of c.departments) {
      console.log(`  DEPT: ${d.name} (${d.abbreviation}) [${d.id}]`)
      for (const p of d.programs) {
        console.log(`    PROGRAM: ${p.name} (${p.abbreviation}) [${p.id}]`)
        for (const yl of p.yearLevels) {
          const secs = yl.sections.map((s: any) => s.name).join(', ')
          console.log(`      Year ${yl.level} [${yl.id}]: ${secs || 'no sections'}`)
        }
      }
      console.log(`    SUBJECTS (${d.subjects.length}):`)
      for (const s of d.subjects) {
        console.log(`      ${s.code} | ${s.title} | u=${s.units} yr=${s.year} sem=${s.semester} type=${s.type}`)
      }
    }
  }
  await db.$disconnect()
}
main().catch(e => console.error(e))
