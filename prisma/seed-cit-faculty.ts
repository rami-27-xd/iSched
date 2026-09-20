/**
 * Replaces the CIT faculty roster with the real one (per shop, from the
 * college's list). Program Chairpersons ("PC" on the list) are the existing
 * ADMIN accounts that head each program: those accounts are RENAMED to the
 * real chairperson (login/email unchanged) and given the faculty record; every
 * other person becomes a record-only stub faculty (faculty do not sign in).
 *
 * Every other CIT faculty record is removed first (stub users included).
 * Safe because CIT faculty carry no schedule entries at the time of writing —
 * the script refuses to run if any of them do.
 *
 * Afterwards run prisma/seed-cit-specs-availability.ts so the new roster gets
 * program-matched specializations and weekday availability.
 *
 *   npx tsx --env-file=.env prisma/seed-cit-faculty.ts [--dry-run]
 */
import { db } from "../lib/db"

// Shop → program abbreviation in the database.
const SHOP_PROGRAM: Record<string, string> = {
  CPT: "BIT-Comp",     // Computer Technology
  IT: "BSInfoTech",    // Information Technology
  AT: "BIT-Auto",      // Automotive
  ELX: "BIT-Eltx",     // Electronics
  ELT: "BIT-Elec",     // Electrical
  IDT: "BIT-ID",       // Industrial Design
  GT: "BIT-Garm",      // Garments
  FT: "BIT-Culi",      // Food / Culinary
  MT: "BIT-Mech",      // Mechanical
}

// "LAST, FIRST M." as written on the list; pc = Program Chairperson of the shop.
const ROSTER: { shop: string; name: string; pc?: boolean }[] = [
  { shop: "CPT", name: "DELA ROSA, GILES A.", pc: true },
  { shop: "IT", name: "DANGANAN, REYNALDO V.", pc: true },
  { shop: "IT", name: "GAGAN, RACHELLE B." },
  { shop: "IT", name: "VALDORIA, JOHN C." },
  { shop: "IT", name: "SENO, DON EVERETTE" },
  { shop: "AT", name: "MANGUBAT, ANGELITO O.", pc: true },
  { shop: "AT", name: "FULGUERINAS, JOHN MICHAEL B." },
  { shop: "ELX", name: "SANJVICTORES, JOSE D.", pc: true },
  { shop: "ELX", name: "JAMILANO, AARON T." },
  { shop: "ELT", name: "BELLO, DEVIE S.", pc: true },
  { shop: "ELT", name: "QUIAMBAO, NICHOLAI G." },
  { shop: "ELT", name: "FALLER, IAN ALDWIN O." },
  { shop: "ELT", name: "PEDRO, ALCANTARA" },
  { shop: "IDT", name: "RACELIS, LENDEL D.", pc: true },
  { shop: "IDT", name: "MANDAING, OLIVER R." },
  { shop: "IDT", name: "MACARIOLA, CHRISTIAN EDWARD B." },
  { shop: "GT", name: "LINGATONG, MARICEL O.", pc: true },
  { shop: "GT", name: "CABALSA, DONABEL H." },
  { shop: "FT", name: "LAGUADOR, AURITA A.", pc: true },
  { shop: "FT", name: "LAGUADOR, ALEXANDRIA" },
  { shop: "MT", name: "CAMPITA, JERWIN D.", pc: true },
  { shop: "MT", name: "ATIENZA, SARAH PALOMA R." },
  { shop: "MT", name: "NANEZ, ALEX NICKO C." },
]

const DRY = process.argv.includes("--dry-run")

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
}
function splitName(full: string): { firstName: string; lastName: string } {
  const [last, first] = full.split(",").map((x) => x.trim())
  return { lastName: titleCase(last), firstName: titleCase(first ?? "") }
}

async function main() {
  const cit = await db.department.findFirst({ where: { college: { abbreviation: "CIT" } }, select: { id: true, name: true } })
  if (!cit) throw new Error("CIT department not found")
  const programs = await db.program.findMany({ where: { departmentId: cit.id }, select: { id: true, abbreviation: true, head: { select: { userId: true, user: { select: { firstName: true, lastName: true, email: true } } } } } })
  const programByAbbr = new Map(programs.map((p) => [p.abbreviation, p]))
  for (const abbr of Object.values(SHOP_PROGRAM)) if (!programByAbbr.has(abbr)) throw new Error(`Program ${abbr} not found in ${cit.name}`)

  const existing = await db.faculty.findMany({
    where: { departmentId: cit.id },
    select: { id: true, userId: true, user: { select: { supabaseId: true, firstName: true, lastName: true } }, _count: { select: { scheduleEntries: true, teachingLoads: true } } },
  })
  const withEntries = existing.filter((f) => f._count.scheduleEntries > 0 || f._count.teachingLoads > 0)
  if (withEntries.length > 0) {
    throw new Error(`Refusing: ${withEntries.length} CIT faculty still have schedule entries / teaching loads (e.g. ${withEntries.slice(0, 3).map((f) => `${f.user.lastName}, ${f.user.firstName}`).join("; ")}). Remove those classes first.`)
  }
  console.log(`${cit.name}: removing ${existing.length} current faculty record(s), adding ${ROSTER.length}${DRY ? " (dry run)" : ""}\n`)

  // ── Remove the old roster ───────────────────────────────────────────────
  const stubUserIds = existing.filter((f) => f.user.supabaseId.startsWith("manual-")).map((f) => f.userId)
  if (!DRY) {
    await db.faculty.deleteMany({ where: { departmentId: cit.id } }) // availability rows cascade
    await db.user.deleteMany({ where: { id: { in: stubUserIds }, supabaseId: { startsWith: "manual-" } } })
  }
  console.log(`  removed ${existing.length} faculty (${stubUserIds.length} stub users deleted; ${existing.length - stubUserIds.length} real accounts kept)`)

  // ── Add the new roster ──────────────────────────────────────────────────
  const counters: Record<string, number> = {}
  for (const entry of ROSTER) {
    const program = programByAbbr.get(SHOP_PROGRAM[entry.shop])!
    const { firstName, lastName } = splitName(entry.name)
    counters[entry.shop] = (counters[entry.shop] ?? 0) + 1
    const employeeId = `CIT-${entry.shop}-${String(counters[entry.shop]).padStart(2, "0")}`

    if (entry.pc) {
      // The program's existing chairperson ACCOUNT becomes this person.
      const head = program.head
      if (!head) {
        console.log(`  ! ${program.abbreviation} has no Program Chairperson account yet — ${lastName}, ${firstName} added as faculty only`)
      } else {
        console.log(`  PC ${program.abbreviation}: account ${head.user.lastName}, ${head.user.firstName} (${head.user.email}) → ${lastName}, ${firstName}`)
        if (!DRY) {
          await db.user.update({ where: { id: head.userId }, data: { firstName, lastName } })
          await db.faculty.create({ data: { userId: head.userId, departmentId: cit.id, programId: program.id, employeeId, employmentType: "REGULAR", maxUnitsPerWeek: 21, maxHoursPerWeek: 30, specializations: [], sectionCounts: {} } })
        }
        continue
      }
    }
    console.log(`  ${program.abbreviation}: ${lastName}, ${firstName} [${employeeId}]`)
    if (!DRY) {
      const user = await db.user.create({
        data: { supabaseId: `manual-${employeeId.toLowerCase()}-${Date.now()}`, firstName, lastName, role: "FACULTY", isApproved: true, departmentId: cit.id },
      })
      await db.faculty.create({ data: { userId: user.id, departmentId: cit.id, programId: program.id, employeeId, employmentType: "REGULAR", maxUnitsPerWeek: 21, maxHoursPerWeek: 30, specializations: [], sectionCounts: {} } })
    }
  }

  const untouched = programs.filter((p) => !Object.values(SHOP_PROGRAM).includes(p.abbreviation))
  if (untouched.length) console.log(`\nPrograms not on the list (no faculty added): ${untouched.map((p) => p.abbreviation).join(", ")}`)
  console.log(DRY ? "\nDry run — nothing written." : "\nDone. Now run: npx tsx --env-file=.env prisma/seed-cit-specs-availability.ts")
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) }).finally(() => db.$disconnect())
