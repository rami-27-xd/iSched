/**
 * Assigns the correct programId to every CAS major subject.
 * Previously all 170 CAS subjects had programId=null (treated as GEC/shared),
 * causing the scheduler to assign Biology/History/etc. subjects to wrong sections.
 *
 * Mapping (by subject code prefix):
 *   COM, COMM, CSH, FLS → BA Communication
 *   HST, HSTE            → BA History
 *   PSY                  → BA Psychology
 *   BCH, BIO, BOT, BPH,
 *   BST, MCB, PHY, ZOO   → BS Biology
 *   MAT, MATH            → BS Mathematics
 *   GEC, GEL, NSTP,
 *   PATHFit              → keep null (department-wide / auto-excluded)
 *
 * Run: npx tsx --env-file=.env prisma/assign-cas-subject-programs.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

const PREFIX_TO_PROGRAM: Record<string, string> = {
  COM:    "BAComm",
  COMM:   "BAComm",
  CSH:    "BAComm",

  FLS:    "BAHist",
  HST:    "BAHist",
  HSTE:   "BAHist",

  PSY:    "BAPsych",

  BCH:    "BSBio",
  BIO:    "BSBio",
  BOT:    "BSBio",
  BPH:    "BSBio",
  BST:    "BSBio",
  MCB:    "BSBio",
  PHY:    "BSBio",
  ZOO:    "BSBio",

  MAT:    "BSMath",
  MATH:   "BSMath",
}

// Prefixes that stay null — GEC/GEL are shared, NSTP/PATHFit are manually scheduled
const KEEP_NULL_PREFIXES = ["GEC", "GEL", "NSTP", "PATHF"]

function getPrefix(code: string): string {
  // Match the longest key that the code starts with (case-insensitive)
  return Object.keys(PREFIX_TO_PROGRAM).sort((a, b) => b.length - a.length).find(p =>
    code.toUpperCase().startsWith(p.toUpperCase())
  ) ?? ""
}

async function main() {
  const casDept = await db.department.findFirstOrThrow({
    where: { college: { abbreviation: "CAS" } },
  })

  // Build abbrev → program id map
  const programs = await db.program.findMany({ where: { departmentId: casDept.id } })
  const progMap = new Map(programs.map(p => [p.abbreviation, p.id]))
  console.log("Programs:", [...progMap.entries()].map(([k, v]) => `${k}=${v.slice(-6)}`).join("  "))

  const subjects = await db.subject.findMany({
    where: { departmentId: casDept.id },
    orderBy: { code: "asc" },
  })

  let updated = 0
  let skipped = 0
  let unmatched: string[] = []

  for (const s of subjects) {
    const isNullKeep = KEEP_NULL_PREFIXES.some(p => s.code.toUpperCase().startsWith(p.toUpperCase()))
    if (isNullKeep) { skipped++; continue }

    const prefix = getPrefix(s.code)
    const progAbbrev = PREFIX_TO_PROGRAM[prefix.toUpperCase()] ?? PREFIX_TO_PROGRAM[prefix]
    const programId = progAbbrev ? progMap.get(progAbbrev) : undefined

    if (!programId) {
      unmatched.push(`${s.code} (${s.title})`)
      continue
    }

    await db.subject.update({
      where: { id: s.id },
      data: { programId },
    })
    updated++
  }

  console.log(`\nUpdated: ${updated}  |  Kept null (GEC/NSTP/PATHFit): ${skipped}`)
  if (unmatched.length > 0) {
    console.log(`\nUnmatched (still null — review manually):`)
    unmatched.forEach(s => console.log(`  ${s}`))
  }
  console.log("\nDone.")
}

main().catch(console.error).finally(() => db.$disconnect())
