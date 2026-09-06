import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  const cagDept = await db.department.findFirstOrThrow({
    where: { college: { abbreviation: "CAG" } },
    include: { programs: true },
  })

  const prog = Object.fromEntries(cagDept.programs.map(p => [p.abbreviation, p.id]))
  console.log("Programs:", Object.keys(prog).join(", "))

  // Assign each subject to its correct program based on content
  const assignments: { codes: string[]; programAbbr: string }[] = [
    // Crop Production subjects → BS Agriculture – Crop Science
    { codes: ["AGR13", "AGR13L"], programAbbr: "BSAgri-CS" },
    // Animal Science subjects → BS Agriculture – Animal Science
    { codes: ["ASC11", "ASC11L"], programAbbr: "BSAgri-AS" },
    // General Agriculture intro → shared across all BSAgri programs
    // Keep AGR11 as dept-wide (programId=null) so all BSAgri sections get it
  ]

  let totalUpdated = 0
  for (const { codes, programAbbr } of assignments) {
    const programId = prog[programAbbr]
    if (!programId) { console.log(`✗ Program ${programAbbr} not found — skipping`); continue }

    const { count } = await db.subject.updateMany({
      where: { departmentId: cagDept.id, code: { in: codes } },
      data: { programId },
    })
    console.log(`✓ ${codes.join(", ")} → ${programAbbr} (${count} updated)`)
    totalUpdated += count
  }

  // Verify
  const remaining = await db.subject.findMany({
    where: { departmentId: cagDept.id, programId: null },
    select: { code: true, title: true },
  })
  console.log(`\nStill dept-wide (programId=null) in CAG: ${remaining.length}`)
  remaining.forEach(s => console.log(`  ${s.code} — ${s.title}`))
  console.log(`\nTotal fixed: ${totalUpdated}`)
}

main().catch(console.error).finally(() => db.$disconnect())
