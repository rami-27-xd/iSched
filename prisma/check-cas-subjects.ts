/**
 * Shows all CAS subjects grouped by their programId assignment.
 * Run: npx tsx --env-file=.env prisma/check-cas-subjects.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const casDept = await db.department.findFirstOrThrow({
    where: { college: { abbreviation: "CAS" } },
  })

  const subjects = await db.subject.findMany({
    where: { departmentId: casDept.id },
    include: { program: true },
    orderBy: [{ programId: "asc" }, { code: "asc" }],
  })

  console.log(`\nTotal CAS subjects: ${subjects.length}\n`)

  // Group by program
  const byProgram = new Map<string, typeof subjects>()
  for (const s of subjects) {
    const key = s.program ? `${s.program.abbreviation} — ${s.program.name}` : "null (no program = GEC/dept-wide)"
    if (!byProgram.has(key)) byProgram.set(key, [])
    byProgram.get(key)!.push(s)
  }

  for (const [prog, subs] of byProgram) {
    console.log(`\n[${prog}]  (${subs.length} subjects)`)
    for (const s of subs) {
      console.log(`  ${s.code.padEnd(14)} ${s.title}`)
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect())
