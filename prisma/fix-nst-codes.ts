import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  const citDept = await db.department.findFirstOrThrow({ where: { abbreviation: "CIT" } })

  // Rename NST01 → NSTP1 and NST02 → NSTP2 in the CIT department
  // so codes align with the CAS authoritative GEC records
  const renames = [
    { from: "NST01", to: "NSTP1" },
    { from: "NST02", to: "NSTP2" },
  ]

  for (const { from, to } of renames) {
    const existing = await db.subject.findUnique({
      where: { code_departmentId: { code: from, departmentId: citDept.id } },
    })
    if (!existing) {
      console.log(`  ${from} not found in CIT — skipping`)
      continue
    }

    // Check if target code already exists (could have been seeded both ways)
    const target = await db.subject.findUnique({
      where: { code_departmentId: { code: to, departmentId: citDept.id } },
    })
    if (target) {
      // Delete the old NST01 record — NSTP1 already exists
      await db.subject.delete({
        where: { code_departmentId: { code: from, departmentId: citDept.id } },
      })
      console.log(`  Deleted duplicate ${from} (CIT already has ${to})`)
    } else {
      // Rename NST01 → NSTP1
      await db.subject.update({
        where: { code_departmentId: { code: from, departmentId: citDept.id } },
        data: { code: to },
      })
      console.log(`  Renamed ${from} → ${to} in CIT`)
    }
  }

  // Also deduplicate GEC codes within CIT — delete CIT records where CAS has the same code
  // This prevents the fallback merge from ever showing CIT GEC duplicates
  const casGecs = await db.subject.findMany({
    where: {
      department: { abbreviation: "CAS" },
      OR: [
        { code: { startsWith: "GEC" } },
        { code: { startsWith: "GEL" } },
        { code: { startsWith: "PATHFIT" } },
        { code: { startsWith: "PATHFit" } },
        { code: { startsWith: "NST" } },
      ],
    },
    select: { code: true },
  })
  const casCodes = new Set(casGecs.map(s => s.code))

  const citGecs = await db.subject.findMany({
    where: {
      departmentId: citDept.id,
      OR: [
        { code: { startsWith: "GEC" } },
        { code: { startsWith: "GEL" } },
        { code: { startsWith: "PATHFIT" } },
        { code: { startsWith: "PATHFit" } },
        { code: { startsWith: "NST" } },
      ],
    },
    select: { id: true, code: true },
  })

  let deleted = 0
  for (const s of citGecs) {
    if (casCodes.has(s.code)) {
      await db.subject.delete({ where: { id: s.id } })
      console.log(`  Deleted CIT duplicate: ${s.code}`)
      deleted++
    }
  }
  console.log(`\nDone — renamed NST codes, deleted ${deleted} CIT GEC duplicates`)
}

main().catch(console.error).finally(() => db.$disconnect())
