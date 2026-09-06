import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

// GEC subject distribution per system specification
const DEPT_SUBJECTS: Record<string, string[]> = {
  "SS":  ["GEC01","GEC02","GEC03","GEC04","GEC09","GEL07","GEL10"],
  "LLH": ["GEC06","GEC07","GEC10","GEC11","GEC12","GEC13","GEC14"],
  "MNS": ["GEC05","GEC08","GEL01"],
}

const DEPT_META: Record<string, { name: string; abbr: string }> = {
  "SS":  { abbr: "SS",  name: "Social Sciences" },
  "LLH": { abbr: "LLH", name: "Languages, Literature, and Humanities" },
  "MNS": { abbr: "MNS", name: "Mathematics and Natural Sciences" },
}

async function main() {
  // 1. Find the CAS college
  const cas = await db.college.findFirstOrThrow({ where: { abbreviation: "CAS" } })
  console.log("CAS college:", cas.id, cas.name)

  // 2. Create the 3 sub-departments (skip if already exist)
  const deptIds: Record<string, string> = {}
  for (const key of ["SS","LLH","MNS"]) {
    const meta = DEPT_META[key]
    const existing = await db.department.findFirst({ where: { abbreviation: meta.abbr, collegeId: cas.id } })
    if (existing) {
      deptIds[key] = existing.id
      console.log(`✓ Dept "${meta.name}" already exists: ${existing.id.slice(0,8)}`)
    } else {
      const created = await db.department.create({
        data: { name: meta.name, abbreviation: meta.abbr, collegeId: cas.id },
      })
      deptIds[key] = created.id
      console.log(`+ Created dept "${meta.name}": ${created.id.slice(0,8)}`)
    }
  }

  // 3. Move GEC subjects to their correct sub-department
  let moved = 0
  for (const [key, codes] of Object.entries(DEPT_SUBJECTS)) {
    const deptId = deptIds[key]
    const result = await db.subject.updateMany({
      where: { code: { in: codes } },
      data: { departmentId: deptId },
    })
    console.log(`  ${DEPT_META[key].name}: moved ${result.count} subjects (${codes.join(", ")})`)
    moved += result.count
  }
  console.log(`\nTotal GEC subjects moved: ${moved}`)

  // 4. Verify
  const gecs = await db.subject.findMany({
    where: { OR: ["GEC","GEL"].map(p => ({ code: { startsWith: p } })) },
    include: { department: true },
    orderBy: { code: "asc" },
  })
  console.log("\nVerification:")
  gecs.forEach(s => console.log(`  ${s.code.padEnd(8)} → dept: ${s.department?.abbreviation ?? "NULL"} (${s.department?.name ?? "NONE"})`))
}

main().catch(console.error).finally(() => db.$disconnect())
