import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  // Find all subjects with programId = null to see what's being treated as dept-wide
  const nullProgram = await db.subject.findMany({
    where: { programId: null },
    include: { department: { include: { college: true } } },
    orderBy: [{ department: { abbreviation: "asc" } }, { code: "asc" }],
  })

  console.log(`\n=== Subjects with programId = NULL (treated as dept-wide) ===`)
  console.log(`Total: ${nullProgram.length}\n`)

  const byDept = new Map<string, typeof nullProgram>()
  for (const s of nullProgram) {
    const key = `${s.department?.college?.abbreviation ?? "?"}/${s.department?.abbreviation ?? "?"}`
    if (!byDept.has(key)) byDept.set(key, [])
    byDept.get(key)!.push(s)
  }

  for (const [dept, subjects] of byDept) {
    console.log(`\n${dept} (${subjects.length} subjects):`)
    for (const s of subjects) {
      console.log(`  ${s.code.padEnd(12)} year=${s.year} type=${s.type}  "${s.title}"`)
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect())
