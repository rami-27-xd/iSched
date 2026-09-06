import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

const GEC_PREFIXES = ["GEC", "GEL", "PATHFIT", "PATHFit", "NST"]

async function main() {
  // Simulate the ADMIN merge: fetch GEC subjects, deduplicate by code (CAS preferred)
  const gecRaw = await db.subject.findMany({
    where: { OR: GEC_PREFIXES.map(p => ({ code: { startsWith: p } })) },
    include: { department: true },
    orderBy: [{ year: "asc" }, { code: "asc" }],
  })

  const gecByCode = new Map<string, typeof gecRaw[0]>()
  for (const g of gecRaw) {
    const existing = gecByCode.get(g.code)
    if (!existing || g.department?.abbreviation === "CAS") gecByCode.set(g.code, g)
  }
  const gecSubjects = Array.from(gecByCode.values())

  console.log(`GEC subjects after dedup: ${gecSubjects.length}`)

  // Simulate merge for CAG department (has 0 own subjects)
  const cagDept = await db.department.findFirst({ where: { college: { abbreviation: "CAG" } }, include: { subjects: true } })
  if (!cagDept) { console.log("CAG dept not found"); return }

  const mergedSubjects = [
    ...cagDept.subjects,
    ...gecSubjects.filter(g => !cagDept.subjects.some((s: any) => s.code === g.code)),
  ]

  const year1First = mergedSubjects.filter(s => s.year === 1 && s.semester === "FIRST")

  console.log(`\nCAG Year 1 1st Sem subjects (after GEC merge): ${year1First.length}`)
  year1First.forEach(s => console.log(`  ${s.code} — ${s.title}`))

  // Check for any remaining duplicates
  const allCodes = mergedSubjects.map(s => s.code)
  const uniqueCodes = [...new Set(allCodes)]
  if (allCodes.length === uniqueCodes.length) {
    console.log("\n✓ No duplicates in merged subject list")
  } else {
    const dups = allCodes.filter((c, i) => allCodes.indexOf(c) !== i)
    console.log(`\n✗ Duplicates found: ${[...new Set(dups)].join(", ")}`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
