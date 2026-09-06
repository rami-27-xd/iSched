import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

const GEC_PREFIXES = ["GEC", "GEL", "PATHFIT", "PATHFit", "NST"]

async function main() {
  const gecAll = await db.subject.findMany({
    where: { OR: GEC_PREFIXES.map(p => ({ code: { startsWith: p } })) },
    include: { department: true },
    orderBy: { code: "asc" },
  })

  // Check for duplicate codes across departments
  const byCode = new Map<string, string[]>()
  for (const s of gecAll) {
    const depts = byCode.get(s.code) ?? []
    depts.push(s.department?.abbreviation ?? "UNKNOWN")
    byCode.set(s.code, depts)
  }

  const duplicates = [...byCode.entries()].filter(([, depts]) => depts.length > 1)
  if (duplicates.length === 0) {
    console.log("✓ No duplicate GEC codes across departments")
  } else {
    console.log("✗ Duplicates found:")
    for (const [code, depts] of duplicates) {
      console.log(`  ${code}: ${depts.join(", ")}`)
    }
  }

  console.log(`\nTotal GEC subjects: ${gecAll.length}`)
  console.log("By department:")
  const byDept = new Map<string, number>()
  for (const s of gecAll) {
    const d = s.department?.abbreviation ?? "UNKNOWN"
    byDept.set(d, (byDept.get(d) ?? 0) + 1)
  }
  for (const [dept, count] of byDept) {
    console.log(`  ${dept}: ${count}`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
