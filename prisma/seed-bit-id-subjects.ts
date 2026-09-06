/**
 * Seeds the curriculum for BIT-ID (Bachelor of Industrial Technology Major in
 * Industrial Design) — the one CIT program with no subjects at all.
 *
 * ⚠️  GENERATED PLACEHOLDER CONTENT — unlike BIT-Culi and BIT-Eltx, whose real
 * curricula already existed in the database and were merely mis-filed under the
 * wrong program (see prisma/fix-subject-program-mismatch.ts), Industrial Design
 * had NO curriculum on record. These subject titles are a reasonable, typical
 * Industrial Design progression written to match this codebase's conventions —
 * they are NOT taken from an official SLSU curriculum document and should be
 * checked against the real one before anything is presented as authoritative.
 * Codes/titles/units are easy to edit here and re-run.
 *
 * Conventions followed (mirrors MET / CUL / ELX blocks exactly):
 *   - "IDT" code prefix, numbered in curriculum order
 *   - a laboratory pairs with its lecture as <code>L / "<title> Laboratory"
 *   - hoursPerWeek == units; requiredRoomType [] and requiredLabSpecialization null
 *   - Years 1–3, FIRST/SECOND, 24 subjects (same size as MET and ELX)
 *   - yearLevelId points at BIT-ID's own year level for that year — the field
 *     entry-validation.ts check #7 uses to match a subject to a section
 *
 * Idempotent: skips any subject code that already exists.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-bit-id-subjects.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

type Row = {
  code: string
  title: string
  units: number
  type: "LECTURE" | "LABORATORY"
  semester: "FIRST" | "SECOND"
  year: number
}

const CURRICULUM: Row[] = [
  // ── Year 1 ────────────────────────────────────────────────────────────
  { code: "IDT01",  title: "Occupational Safety and Health",                 units: 3, type: "LECTURE",    semester: "FIRST",  year: 1 },
  { code: "IDT02",  title: "Design Fundamentals and Visual Communication",   units: 2, type: "LECTURE",    semester: "FIRST",  year: 1 },
  { code: "IDT02L", title: "Design Fundamentals and Visual Communication Laboratory", units: 2, type: "LABORATORY", semester: "FIRST", year: 1 },
  { code: "IDT03",  title: "Technical Drafting for Industrial Design",       units: 2, type: "LECTURE",    semester: "FIRST",  year: 1 },
  { code: "IDT03L", title: "Technical Drafting for Industrial Design Laboratory", units: 2, type: "LABORATORY", semester: "FIRST", year: 1 },

  { code: "IDT04",  title: "Materials and Processes for Design",             units: 1, type: "LECTURE",    semester: "SECOND", year: 1 },
  { code: "IDT04L", title: "Materials and Processes for Design Laboratory",  units: 2, type: "LABORATORY", semester: "SECOND", year: 1 },
  { code: "IDT05",  title: "Freehand and Product Sketching",                 units: 2, type: "LECTURE",    semester: "SECOND", year: 1 },
  { code: "IDT05L", title: "Freehand and Product Sketching Laboratory",      units: 2, type: "LABORATORY", semester: "SECOND", year: 1 },

  // ── Year 2 ────────────────────────────────────────────────────────────
  { code: "IDT06",  title: "Computer-Aided Industrial Design",               units: 1, type: "LECTURE",    semester: "FIRST",  year: 2 },
  { code: "IDT06L", title: "Computer-Aided Industrial Design Laboratory",    units: 1, type: "LABORATORY", semester: "FIRST",  year: 2 },
  { code: "IDT07",  title: "Ergonomics and Human Factors",                   units: 3, type: "LECTURE",    semester: "FIRST",  year: 2 },

  { code: "IDT08",  title: "Model Making and Prototyping",                   units: 2, type: "LECTURE",    semester: "SECOND", year: 2 },
  { code: "IDT08L", title: "Model Making and Prototyping Laboratory",        units: 2, type: "LABORATORY", semester: "SECOND", year: 2 },
  { code: "IDT09",  title: "Furniture and Fixture Design",                   units: 2, type: "LECTURE",    semester: "SECOND", year: 2 },
  { code: "IDT09L", title: "Furniture and Fixture Design Laboratory",        units: 2, type: "LABORATORY", semester: "SECOND", year: 2 },

  // ── Year 3 ────────────────────────────────────────────────────────────
  { code: "IDT10",  title: "Product Design and Development",                 units: 2, type: "LECTURE",    semester: "FIRST",  year: 3 },
  { code: "IDT10L", title: "Product Design and Development Laboratory",      units: 2, type: "LABORATORY", semester: "FIRST",  year: 3 },
  { code: "IDT11",  title: "Packaging Design and Graphics",                  units: 2, type: "LECTURE",    semester: "FIRST",  year: 3 },
  { code: "IDT11L", title: "Packaging Design and Graphics Laboratory",       units: 2, type: "LABORATORY", semester: "FIRST",  year: 3 },

  { code: "IDT12",  title: "3D Digital Modeling and Rendering",              units: 2, type: "LECTURE",    semester: "SECOND", year: 3 },
  { code: "IDT12L", title: "3D Digital Modeling and Rendering Laboratory",   units: 2, type: "LABORATORY", semester: "SECOND", year: 3 },
  { code: "IDT13",  title: "Design Portfolio and Professional Practice",     units: 1, type: "LECTURE",    semester: "SECOND", year: 3 },
  { code: "IDT13L", title: "Design Portfolio and Professional Practice Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 3 },
]

async function main() {
  const cit = await db.department.findFirst({ where: { abbreviation: "CIT" } })
  if (!cit) throw new Error("CIT department not found")

  const program = await db.program.findFirst({
    where: { abbreviation: "BIT-ID", departmentId: cit.id },
    select: { id: true, name: true },
  })
  if (!program) throw new Error("BIT-ID program not found")

  const yearLevels = await db.yearLevel.findMany({
    where: { programId: program.id },
    select: { id: true, level: true },
  })
  const yearLevelByLevel = new Map(yearLevels.map(y => [y.level, y.id]))

  console.log(`Seeding curriculum for ${program.name} (BIT-ID)`)
  console.log(`Year levels available: ${[...yearLevelByLevel.keys()].sort().join(", ")}\n`)

  let created = 0, skipped = 0
  for (const row of CURRICULUM) {
    const existing = await db.subject.findFirst({ where: { code: row.code } })
    if (existing) {
      console.log(`  – skipped (code already exists): ${row.code}`)
      skipped++
      continue
    }
    const yearLevelId = yearLevelByLevel.get(row.year)
    if (!yearLevelId) {
      console.log(`  !! no year level ${row.year} for BIT-ID — skipped ${row.code}`)
      skipped++
      continue
    }

    await db.subject.create({
      data: {
        code: row.code,
        title: row.title,
        units: row.units,
        hoursPerWeek: row.units, // matches the convention across every CIT block
        type: row.type,
        semester: row.semester,
        year: row.year,
        departmentId: cit.id,
        programId: program.id,
        yearLevelId,
        requiredRoomType: [],
        requiredLabSpecialization: null,
      },
    })
    console.log(`  ✓ Y${row.year} ${row.semester.padEnd(6)} ${row.code.padEnd(8)} ${row.units}u ${row.type.padEnd(11)} ${row.title}`)
    created++
  }

  console.log(`\nCreated ${created}, skipped ${skipped}.`)
  console.log("BIT-ID subject total:", await db.subject.count({ where: { programId: program.id } }))
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
