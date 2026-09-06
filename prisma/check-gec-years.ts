import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  const GEC_PREFIXES = ["GEC", "GEL", "PATHFIT", "PATHFit", "NST"]
  const subs = await db.subject.findMany({
    where: { OR: GEC_PREFIXES.map(p => ({ code: { startsWith: p } })) },
    orderBy: [{ year: "asc" }, { code: "asc" }],
    select: { code: true, year: true, units: true, hoursPerWeek: true, type: true, department: { select: { college: { select: { abbreviation: true } } } } }
  })
  console.log(`Total GEC subjects: ${subs.length}`)
  subs.forEach(s =>
    console.log(`  ${s.code.padEnd(14)} year=${s.year} units=${s.units} hrs=${s.hoursPerWeek} ${s.type.padEnd(12)} [${s.department?.college?.abbreviation ?? "?"}]`)
  )

  const missingYear = subs.filter(s => !s.year || s.year === 0)
  if (missingYear.length) {
    console.log(`\n⚠ ${missingYear.length} GEC subject(s) have year=0 or null — they won't match any section:`)
    missingYear.forEach(s => console.log(`  ${s.code}`))
  } else {
    console.log("\n✓ All GEC subjects have a valid year field")
  }
}

main().catch(console.error).finally(() => db.$disconnect())
