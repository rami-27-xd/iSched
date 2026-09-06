import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  const casDepts = await db.department.findMany({
    where: { college: { abbreviation: "CAS" } },
    include: { college: true, programs: true },
    orderBy: { name: "asc" },
  })

  console.log(`CAS departments (${casDepts.length}):`)
  for (const d of casDepts) {
    console.log(`  [${d.id}] ${d.abbreviation} — "${d.name}" (${d.programs.length} programs)`)
  }

  // Also show all departments across the whole university
  const allDepts = await db.department.findMany({
    include: { college: true },
    orderBy: [{ college: { abbreviation: "asc" } }, { name: "asc" }],
  })
  console.log(`\nAll departments (${allDepts.length}):`)
  for (const d of allDepts) {
    console.log(`  [${d.id.substring(0,8)}] ${d.college.abbreviation} / ${d.abbreviation} — "${d.name}"`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
