/**
 * Seeds specializations + weekly availability for every CIT faculty member,
 * scoped to their own Program Chairperson's program.
 *
 *  Specializations — subject TITLES (that's what the engine matches on:
 *    scheduler.ts matchesSpecialization / entry-validation.ts check #5), taken
 *    ONLY from that faculty's own program's subjects. Distributed round-robin
 *    with redundancy so every subject has several qualified faculty and the
 *    backtracking engine always has alternatives when one is busy.
 *
 *  Availability — Monday to Friday only (never Saturday, which is reserved for
 *    CAM/NSTP anyway), split around a midday break:
 *        07:30 – 12:00   morning
 *        12:00 – 13:00   BREAK (no row = unavailable)
 *        13:00 – 17:00   afternoon
 *    Times sit on the app's own 30-minute grid (07:30 … 21:00).
 *
 * Idempotent: faculty that already have specializations are left alone
 * (preserves manual edits), and availability is only added where missing.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-cit-specs-availability.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const
const BLOCKS = [
  { startTime: "07:30", endTime: "12:00" }, // morning
  { startTime: "13:00", endTime: "17:00" }, // afternoon (12:00–13:00 is the break)
]

// Each subject gets ~2 qualified faculty; every faculty gets at least this many
// subjects so nobody is left unschedulable.
const REDUNDANCY = 2
const MIN_SPECS = 3

async function main() {
  const cit = await db.department.findFirst({ where: { abbreviation: "CIT" } })
  if (!cit) throw new Error("CIT department not found")

  // Target the current academic year's two semesters. Availability is stored
  // per semester, and no semester is currently flagged active — the app falls
  // back to the most recent academic year, and the Faculty Availability page
  // has been writing to FIRST 2026-2027, so cover both of that year's terms.
  const semesters = await db.semester.findMany({
    where: { academicYear: { label: "2026-2027" } },
    select: { id: true, type: true, academicYear: { select: { label: true } } },
  })
  if (semesters.length === 0) throw new Error("No semesters found for AY 2026-2027")
  console.log(`Semesters targeted: ${semesters.map(s => `${s.type} ${s.academicYear?.label}`).join(", ")}\n`)

  // CIT subjects grouped by program, plus the department-wide (programId: null)
  // pool used as the fallback for faculty whose program has no subjects yet.
  const citSubjects = await db.subject.findMany({
    where: { departmentId: cit.id },
    select: { id: true, title: true, programId: true, code: true },
    orderBy: { code: "asc" },
  })
  const byProgram = new Map<string, string[]>() // programId -> titles
  const sharedTitles: string[] = []
  for (const s of citSubjects) {
    if (!s.title) continue
    if (s.programId) {
      if (!byProgram.has(s.programId)) byProgram.set(s.programId, [])
      byProgram.get(s.programId)!.push(s.title)
    } else {
      sharedTitles.push(s.title)
    }
  }

  // Faculty grouped by their assigned program (set when each Program Chair's
  // roster was seeded). programId null = department-wide pool.
  const facultyRows = await db.faculty.findMany({
    where: { departmentId: cit.id },
    select: {
      id: true, programId: true, specializations: true,
      user: { select: { firstName: true, lastName: true } },
      program: { select: { abbreviation: true } },
    },
    orderBy: { employeeId: "asc" },
  })

  const groups = new Map<string, typeof facultyRows>()
  for (const f of facultyRows) {
    const key = f.programId ?? "__dept_wide__"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }

  let specsSet = 0, specsSkipped = 0
  const fallbackGroups: string[] = []

  for (const [key, roster] of groups) {
    const label = roster[0]?.program?.abbreviation ?? "(department-wide)"
    const ownTitles = key === "__dept_wide__" ? [] : (byProgram.get(key) ?? [])

    // A program with no subjects of its own falls back to CIT's shared
    // department-wide subjects so its faculty are still schedulable.
    const usingFallback = ownTitles.length === 0
    const pool = usingFallback ? sharedTitles : ownTitles
    if (usingFallback) fallbackGroups.push(label)

    if (pool.length === 0) {
      console.log(`  ${label.padEnd(18)} — no subjects available at all, skipped`)
      continue
    }

    const perFaculty = Math.max(MIN_SPECS, Math.ceil((pool.length * REDUNDANCY) / roster.length))
    let idx = 0
    let groupSet = 0, groupSkipped = 0

    for (const f of roster) {
      if (f.specializations.length > 0) { groupSkipped++; specsSkipped++; idx += perFaculty; continue }
      const specs = new Set<string>()
      for (let k = 0; k < perFaculty; k++) {
        specs.add(pool[idx % pool.length])
        idx++
      }
      await db.faculty.update({
        where: { id: f.id },
        data: { specializations: [...specs] },
      })
      groupSet++; specsSet++
    }
    console.log(
      `  ${label.padEnd(18)} ${String(roster.length).padStart(3)} faculty · ` +
      `${String(pool.length).padStart(3)} subjects${usingFallback ? " (shared fallback)" : ""} · ` +
      `${perFaculty}/faculty · set=${groupSet} skipped=${groupSkipped}`
    )
  }

  // ── Availability ────────────────────────────────────────────────────────
  console.log("\nAvailability (Mon–Fri, 07:30–12:00 and 13:00–17:00, break 12:00–13:00):")
  const facultyIds = facultyRows.map(f => f.id)

  let availCreated = 0
  for (const sem of semesters) {
    const rows: { facultyId: string; day: any; startTime: string; endTime: string; semesterId: string }[] = []
    for (const fid of facultyIds) {
      for (const day of WEEKDAYS) {
        for (const b of BLOCKS) {
          rows.push({ facultyId: fid, day, startTime: b.startTime, endTime: b.endTime, semesterId: sem.id })
        }
      }
    }
    // skipDuplicates relies on @@unique([facultyId, day, startTime, semesterId]),
    // so re-running never doubles up and manual rows are left untouched.
    const res = await db.facultyAvailability.createMany({ data: rows as any, skipDuplicates: true })
    availCreated += res.count
    console.log(`  ${sem.type} ${sem.academicYear?.label}: created ${res.count} of ${rows.length} rows (rest already existed)`)
  }

  console.log(`\nDone. Specializations set on ${specsSet} faculty (${specsSkipped} already had some, left alone).`)
  console.log(`Availability rows created: ${availCreated}`)
  if (fallbackGroups.length > 0) {
    console.log(`\nNOTE: these programs have NO subjects in the database, so their faculty`)
    console.log(`were given CIT's shared department-wide subjects instead: ${fallbackGroups.join(", ")}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
