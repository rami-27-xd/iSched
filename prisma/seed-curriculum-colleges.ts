/**
 * seed-curriculum-colleges.ts
 * ---------------------------
 * Seeds the curricula of the College of Teacher Education (CTE), College of
 * Engineering (CEN), College of Allied Medicine (CAM) and College of
 * Administration, Business, Hospitality and Accountancy (CABHA) from the data
 * modules in prisma/curricula/ (transcribed from the official curriculum .docx
 * files — see each module's header for the few code normalisations applied).
 *
 * What it writes:
 *   - Subject rows in each college's department. A code used by ONE program is a
 *     program major (programId + yearLevelId set); a code used by SEVERAL programs of
 *     the same department is a dept-wide subject (programId / yearLevelId null) whose
 *     per-program placement lives in lib/curriculum-map.ts — same model as CIT's
 *     shared CHM01a / MAT04a / RES01a rows.
 *   - Lecture/lab rows are split into CODE + CODEL exactly like every other seed;
 *     hoursPerWeek == units; requiredRoomType [] (lib/room-type-rules.ts infers it).
 *   - GEC / GEL / PATHFit / NSTP codes are NOT created here — CAS owns them. The
 *     runner only checks that every referenced CAS code exists, and upserts the three
 *     GE electives these curricula introduce (prisma/curricula/index.ts).
 *
 * It expects the colleges, departments, programs and year levels to exist already
 * (they do — prisma/seed.ts); it fails loudly if a program is missing rather than
 * inventing one.
 *
 * Idempotent: upserts on (code, departmentId); re-running refreshes titles/units.
 *
 * Run (all four colleges):
 *   npx tsx --env-file=.env prisma/seed-curriculum-colleges.ts
 * Run one or more:
 *   npx tsx --env-file=.env prisma/seed-curriculum-colleges.ts CTE CAM
 * Preview without writing:
 *   npx tsx --env-file=.env prisma/seed-curriculum-colleges.ts --dry-run
 *
 * Point DATABASE_URL at the Supabase session-pooler URL to seed production.
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  COLLEGE_CURRICULA,
  NEW_CAS_GE_ELECTIVES,
  canonicalCode,
  expandRow,
  isGeCode,
  type CollegeCurriculum,
  type Sem,
  type SubjectSpec,
} from "./curricula"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const requested = args.filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase())
const targets = requested.length ? requested : Object.keys(COLLEGE_CURRICULA)

interface Occurrence {
  program: string
  year: number
  sem: Sem
  spec: SubjectSpec
}

/** Most frequent value; ties go to the first one seen (document order). */
function mode<T>(values: T[]): T {
  const counts = new Map<string, { value: T; n: number }>()
  for (const v of values) {
    const k = JSON.stringify(v)
    const e = counts.get(k)
    if (e) e.n++
    else counts.set(k, { value: v, n: 1 })
  }
  let best: { value: T; n: number } | undefined
  for (const e of counts.values()) if (!best || e.n > best.n) best = e
  return best!.value
}

async function seedCollege(cur: CollegeCurriculum, casDeptId: string, casCodes: Set<string>) {
  console.log(`\n=== ${cur.college} ===`)

  const dept = await db.department.findFirst({
    where: { abbreviation: cur.department, college: { abbreviation: cur.college } },
    select: { id: true, name: true },
  })
  if (!dept) throw new Error(`${cur.college}: department "${cur.department}" not found — run prisma/seed.ts first`)
  console.log(`Department: ${dept.name} (${dept.id})`)

  // Resolve programs + year levels up front so a typo fails before anything is written.
  const programs = new Map<string, { id: string; yearLevels: Map<number, string> }>()
  for (const p of cur.programs) {
    const prog = await db.program.findFirst({
      where: { abbreviation: p.abbreviation, departmentId: dept.id },
      select: { id: true, yearLevels: { select: { id: true, level: true } } },
    })
    if (!prog) throw new Error(`${cur.college}: program "${p.abbreviation}" not found in ${cur.department}`)
    programs.set(p.abbreviation, { id: prog.id, yearLevels: new Map(prog.yearLevels.map((y) => [y.level, y.id])) })
  }

  // ── Build the department catalog ────────────────────────────────────────
  const catalog = new Map<string, Occurrence[]>()
  const missingGe = new Set<string>()
  for (const p of cur.programs) {
    for (const b of p.blocks) {
      for (const row of b.rows) {
        const code = canonicalCode(row.code)
        if (isGeCode(code)) {
          if (!casCodes.has(code)) missingGe.add(code)
          continue
        }
        for (const spec of expandRow(row)) {
          const list = catalog.get(spec.code) ?? []
          list.push({ program: p.abbreviation, year: b.year, sem: b.sem, spec })
          catalog.set(spec.code, list)
        }
      }
    }
  }
  if (missingGe.size) {
    // Not fatal: GEC ownership is CAS's, but the curriculum map will point at nothing.
    console.warn(`!! GE codes referenced but missing from CAS: ${[...missingGe].sort().join(", ")}`)
  }

  // ── Upsert ──────────────────────────────────────────────────────────────
  let majors = 0
  let shared = 0
  for (const [code, occ] of catalog) {
    const programsUsing = [...new Set(occ.map((o) => o.program))]
    const isShared = programsUsing.length > 1

    const title = mode(occ.map((o) => o.spec.title))
    const units = mode(occ.map((o) => o.spec.units))
    const type = mode(occ.map((o) => o.spec.type))
    const year = mode(occ.map((o) => o.year))
    const semester = mode(occ.map((o) => o.sem))

    const disagreements: string[] = []
    if (new Set(occ.map((o) => o.spec.units)).size > 1) disagreements.push(`units ${occ.map((o) => `${o.program}=${o.spec.units}`).join(", ")}`)
    if (new Set(occ.map((o) => o.spec.type)).size > 1) disagreements.push(`type ${occ.map((o) => `${o.program}=${o.spec.type}`).join(", ")}`)
    if (new Set(occ.map((o) => o.spec.title)).size > 1) disagreements.push(`title (${new Set(occ.map((o) => o.spec.title)).size} variants)`)
    if (disagreements.length) console.warn(`   ~ ${code}: programs disagree on ${disagreements.join("; ")} → kept majority (${units}u ${type} "${title}")`)

    const owner = programs.get(occ[0].program)!
    const programId = isShared ? null : owner.id
    const yearLevelId = isShared ? null : (owner.yearLevels.get(year) ?? null)
    if (!isShared && !yearLevelId) console.warn(`   ~ ${code}: ${occ[0].program} has no year level ${year} — yearLevelId left null`)

    const data = {
      title,
      units,
      hoursPerWeek: units,
      type,
      semester,
      year,
      programId,
      yearLevelId,
      requiredRoomType: [] as never[],
      requiredLabSpecialization: null,
    }

    if (!dryRun) {
      await db.subject.upsert({
        where: { code_departmentId: { code, departmentId: dept.id } },
        update: data,
        create: { code, departmentId: dept.id, ...data },
      })
    }
    if (isShared) shared++
    else majors++
    console.log(
      `  ${isShared ? "shared" : "major "} ${code.padEnd(10)} ${type.padEnd(10)} ${String(units).padStart(2)}u  Y${year} ${semester.padEnd(6)} ` +
        `${isShared ? `[${programsUsing.join(",")}]` : occ[0].program}  ${title}`
    )
  }
  console.log(`${cur.college}: ${majors} program majors + ${shared} dept-wide subjects${dryRun ? " (dry run — nothing written)" : ""}`)
  return { majors, shared }
}

async function main() {
  console.log(`Seeding curricula for: ${targets.join(", ")}${dryRun ? "  [DRY RUN]" : ""}`)
  for (const t of targets) if (!COLLEGE_CURRICULA[t]) throw new Error(`Unknown college "${t}" — choose from ${Object.keys(COLLEGE_CURRICULA).join(", ")}`)

  const cas = await db.department.findFirst({ where: { abbreviation: "CAS" }, select: { id: true } })
  if (!cas) throw new Error("CAS department not found")

  // GE electives introduced by these curricula live in CAS like every other GEC/GEL.
  for (const ge of NEW_CAS_GE_ELECTIVES) {
    if (!dryRun) {
      await db.subject.upsert({
        where: { code_departmentId: { code: ge.code, departmentId: cas.id } },
        update: { title: ge.title, units: ge.units, hoursPerWeek: ge.units },
        create: {
          code: ge.code,
          title: ge.title,
          units: ge.units,
          hoursPerWeek: ge.units,
          type: "LECTURE",
          semester: ge.semester,
          year: ge.year,
          departmentId: cas.id,
          programId: null,
        },
      })
    }
    console.log(`CAS GE elective ensured: ${ge.code} ${ge.title}`)
  }

  const casCodes = new Set(
    (await db.subject.findMany({ where: { departmentId: cas.id, programId: null }, select: { code: true } })).map((s) => s.code)
  )
  for (const ge of NEW_CAS_GE_ELECTIVES) casCodes.add(ge.code) // present even on --dry-run

  let totalMajors = 0
  let totalShared = 0
  for (const t of targets) {
    const { majors, shared } = await seedCollege(COLLEGE_CURRICULA[t], cas.id, casCodes)
    totalMajors += majors
    totalShared += shared
  }
  console.log(`\nDone. ${totalMajors} program majors + ${totalShared} dept-wide subjects across ${targets.length} college(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
