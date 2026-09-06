/**
 * Repairs subjects whose `programId` contradicts the program that owns their
 * `yearLevelId`.
 *
 * Discovered while investigating why BIT-Culi, BIT-Eltx and BIT-ID had zero
 * subjects: their curricula DO exist, they were just filed under the wrong
 * program. The whole Culinary block (CUL01–CUL14, 25 rows) sat under BIT-Comp,
 * and the whole Electronics block (ELX01–ELX13, 24 rows) sat under BIT-Elec —
 * while each row's yearLevelId already pointed at the CORRECT program's year
 * level. The yearLevel is authoritative here: the subject codes and titles
 * match it exactly (CUL = Culinary, ELX = Electronics), and the resulting
 * per-program counts line up with every other CIT program (23–30 subjects).
 *
 * This mismatch also breaks scheduling outright: entry-validation.ts check #7
 * rejects any entry whose subject.yearLevelId != section.yearLevelId with
 * "Program mismatch", so these subjects could not be placed for the program
 * that appeared to own them.
 *
 * Only fixes rows where programId is SET and disagrees. Rows where programId is
 * null (department-wide/shared) but a yearLevel is set are left alone and only
 * reported — for those it's genuinely ambiguous whether the shared flag or the
 * yearLevel is the mistake, and clearing either could break other programs.
 *
 * Run:  npx tsx --env-file=.env prisma/fix-subject-program-mismatch.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  const subjects = await db.subject.findMany({
    where: { yearLevelId: { not: null } },
    select: {
      id: true, code: true, title: true, programId: true,
      program: { select: { abbreviation: true } },
      yearLevel: { select: { programId: true, program: { select: { abbreviation: true } } } },
      department: { select: { abbreviation: true } },
    },
    orderBy: { code: "asc" },
  })

  const wrongProgram = subjects.filter(s => s.yearLevel && s.programId && s.programId !== s.yearLevel.programId)
  const sharedWithYearLevel = subjects.filter(s => s.yearLevel && !s.programId)

  console.log(`Scanned ${subjects.length} subjects that have a yearLevel.\n`)

  if (wrongProgram.length === 0) {
    console.log("No mis-filed subjects found — nothing to repair.")
  } else {
    // Group for a readable summary before writing anything.
    const groups = new Map<string, typeof wrongProgram>()
    for (const s of wrongProgram) {
      const key = `${s.department?.abbreviation}  ${s.program?.abbreviation} → ${s.yearLevel?.program?.abbreviation}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(s)
    }

    console.log(`Repairing ${wrongProgram.length} mis-filed subjects:`)
    for (const [key, rows] of [...groups.entries()].sort()) {
      console.log(`\n  ${key}  (${rows.length} subjects)`)
      console.log(`    ${rows.slice(0, 4).map(r => r.code).join(", ")}${rows.length > 4 ? `, … +${rows.length - 4} more` : ""}`)
    }

    let fixed = 0
    for (const s of wrongProgram) {
      await db.subject.update({
        where: { id: s.id },
        data: { programId: s.yearLevel!.programId },
      })
      fixed++
    }
    console.log(`\nRepaired ${fixed} subjects (programId now matches the program that owns their year level).`)
  }

  if (sharedWithYearLevel.length > 0) {
    console.log(`\nLEFT ALONE — ${sharedWithYearLevel.length} shared subjects (programId: null) that carry a`)
    console.log(`program-specific yearLevel. Ambiguous: either the shared flag or the year level is`)
    console.log(`the mistake, and guessing wrong would break other programs. Listed for review:`)
    for (const s of sharedWithYearLevel) {
      console.log(`  ${s.department?.abbreviation} ${s.code.padEnd(10)} yearLevel owner=${s.yearLevel?.program?.abbreviation}  — ${s.title}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
