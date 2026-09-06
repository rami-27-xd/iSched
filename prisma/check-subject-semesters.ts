/**
 * Verifies Subject.semester data quality — the generate route now filters
 * major subjects by the schedule's semester, so wrong values here would
 * silently exclude subjects from generation.
 *
 * Run: npx tsx --env-file=.env prisma/check-subject-semesters.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const subjects = await db.subject.findMany({
    include: { department: { select: { abbreviation: true } } },
  })

  const byDept = new Map<string, { FIRST: number; SECOND: number; SUMMER: number }>()
  for (const s of subjects) {
    const dept = s.department?.abbreviation ?? "?"
    if (!byDept.has(dept)) byDept.set(dept, { FIRST: 0, SECOND: 0, SUMMER: 0 })
    const rec = byDept.get(dept)!
    rec[s.semester as keyof typeof rec] = (rec[s.semester as keyof typeof rec] ?? 0) + 1
  }

  console.log("Subjects by department and semester:")
  for (const [dept, counts] of byDept) {
    console.log(`  ${dept}: FIRST=${counts.FIRST}  SECOND=${counts.SECOND}  SUMMER=${counts.SUMMER}`)
  }

  // Spot-check FLS (curriculum map: FLS01=2-FIRST, FLS02=2-SECOND, FLS03=3-FIRST, FLS04=3-SECOND)
  const fls = await db.subject.findMany({
    where: { code: { startsWith: "FLS" } },
    select: { code: true, semester: true, year: true, program: { select: { abbreviation: true } } },
    orderBy: { code: "asc" },
  })
  console.log("\nFLS spot-check (expect FLS01=Y2/FIRST, FLS02=Y2/SECOND, FLS03=Y3/FIRST, FLS04=Y3/SECOND, program=BAHist):")
  for (const s of fls) {
    console.log(`  ${s.code}: year=${s.year} semester=${s.semester} program=${s.program?.abbreviation ?? "null"}`)
  }

  // Spot-check ITE (map: ITE01=1-FIRST, ITE02=1-SECOND, ITE12=3-FIRST, ITE19=3-SECOND)
  const ite = await db.subject.findMany({
    where: { code: { in: ["ITE01", "ITE02", "ITE12", "ITE19"] } },
    select: { code: true, semester: true, year: true },
    orderBy: { code: "asc" },
  })
  console.log("\nITE spot-check (map: ITE01=1-FIRST, ITE02=1-SECOND, ITE12=3-FIRST, ITE19=3-SECOND):")
  for (const s of ite) {
    console.log(`  ${s.code}: year=${s.year} semester=${s.semester}`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
