/**
 * Re-syncs CIT faculty specializations to their own program's subjects.
 *
 * Needed after prisma/fix-subject-program-mismatch.ts moved 52 mis-filed
 * subjects to their correct programs (the Culinary block off BIT-Comp, the
 * Electronics block off BIT-Elec) and prisma/seed-bit-id-subjects.ts created
 * BIT-ID's curriculum. Faculty specializations seeded before those changes
 * pointed at subjects that no longer belong to their program — e.g. a BIT-Comp
 * faculty listed as specialising in "Food Safety and Sanitation".
 *
 * Rebuilds every program-assigned CIT faculty's specializations from their own
 * program's subject titles, round-robin with redundancy so each subject keeps
 * several qualified faculty. Department-wide faculty (programId null) are left
 * alone — their shared-subject specializations are still correct.
 *
 * Safe to re-run; it is a full rebuild, not an append.
 *
 * Run:  npx tsx --env-file=.env prisma/resync-cit-specializations.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const REDUNDANCY = 2
const MIN_SPECS = 3

async function main() {
  const cit = await db.department.findFirst({ where: { abbreviation: "CIT" } })
  if (!cit) throw new Error("CIT department not found")

  const programs = await db.program.findMany({
    where: { departmentId: cit.id },
    select: { id: true, abbreviation: true },
    orderBy: { abbreviation: "asc" },
  })

  let totalRebuilt = 0, totalUnchanged = 0

  for (const p of programs) {
    const titles = (await db.subject.findMany({
      where: { programId: p.id },
      select: { title: true },
      orderBy: { code: "asc" },
    })).map(s => s.title!).filter(Boolean)

    const roster = await db.faculty.findMany({
      where: { departmentId: cit.id, programId: p.id },
      select: { id: true, specializations: true },
      orderBy: { employeeId: "asc" },
    })

    if (titles.length === 0 || roster.length === 0) {
      console.log(`  ${p.abbreviation.padEnd(12)} — ${titles.length === 0 ? "no subjects" : "no faculty"}, skipped`)
      continue
    }

    const validTitles = new Set(titles)
    const perFaculty = Math.max(MIN_SPECS, Math.ceil((titles.length * REDUNDANCY) / roster.length))

    let idx = 0, rebuilt = 0, unchanged = 0
    for (const f of roster) {
      // Already correct (every specialization belongs to this program) — leave it.
      const isClean = f.specializations.length > 0 && f.specializations.every(s => validTitles.has(s))
      if (isClean) { unchanged++; idx += perFaculty; continue }

      const specs = new Set<string>()
      for (let k = 0; k < perFaculty; k++) {
        specs.add(titles[idx % titles.length])
        idx++
      }
      await db.faculty.update({ where: { id: f.id }, data: { specializations: [...specs] } })
      rebuilt++
    }

    // Coverage check for this program.
    const after = await db.faculty.findMany({
      where: { departmentId: cit.id, programId: p.id },
      select: { specializations: true },
    })
    const covered = new Set(after.flatMap(f => f.specializations))
    const uncovered = titles.filter(t => !covered.has(t))

    console.log(
      `  ${p.abbreviation.padEnd(12)} subjects=${String(titles.length).padStart(2)} ` +
      `faculty=${roster.length} ${perFaculty}/each · rebuilt=${rebuilt} unchanged=${unchanged} · ` +
      `uncovered=${uncovered.length}${uncovered.length ? ` (${uncovered.slice(0, 3).join(", ")})` : ""}`
    )
    totalRebuilt += rebuilt
    totalUnchanged += unchanged
  }

  console.log(`\nRebuilt ${totalRebuilt} faculty, left ${totalUnchanged} already-correct faculty untouched.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
