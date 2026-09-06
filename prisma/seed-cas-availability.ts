/**
 * Two fixes for "Department Chairs can't add schedule entries":
 *
 *  1. Marks FIRST 2026-2027 as the ACTIVE semester. No semester was flagged
 *     active, so every "fall back to the active semester" path in the app was
 *     picking an arbitrary row (`sems[0]`) — the Faculty Availability page wrote
 *     availability against one semester while the schedule being edited read a
 *     different one, which is why availability "didn't appear".
 *
 *  2. Seeds availability for CAS faculty. Only CIT had been seeded (210/210),
 *     while CAS had 2 of 84 — and since availability is now a hard requirement
 *     for scheduling, that blocked Department Chairs from placing anything.
 *
 * Same shape as the CIT seed: Monday–Friday only (never Saturday), split around
 * a midday break — 07:30–12:00, break 12:00–13:00, 13:00–17:00.
 *
 * Idempotent (skipDuplicates on the unique facultyId+day+startTime+semesterId).
 *
 * Run:  npx tsx --env-file=.env prisma/seed-cas-availability.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const
const BLOCKS = [
  { startTime: "07:30", endTime: "12:00" },
  { startTime: "13:00", endTime: "17:00" },
]

async function main() {
  // ── 1. Make the active semester explicit ────────────────────────────────
  const target = await db.semester.findFirst({
    where: { type: "FIRST", academicYear: { label: "2026-2027" } },
    select: { id: true, type: true, academicYear: { select: { label: true } } },
  })
  if (!target) throw new Error("FIRST 2026-2027 semester not found")

  await db.semester.updateMany({ where: { isActive: true }, data: { isActive: false } })
  await db.semester.update({ where: { id: target.id }, data: { isActive: true } })
  console.log(`Active semester set to ${target.type} ${target.academicYear?.label}\n`)

  // ── 2. CAS availability ─────────────────────────────────────────────────
  const cas = await db.department.findFirst({ where: { abbreviation: "CAS" } })
  if (!cas) throw new Error("CAS department not found")

  const semesters = await db.semester.findMany({
    where: { academicYear: { label: "2026-2027" } },
    select: { id: true, type: true, academicYear: { select: { label: true } } },
  })

  const faculty = await db.faculty.findMany({
    where: { departmentId: cas.id },
    select: { id: true },
  })
  console.log(`CAS faculty: ${faculty.length}`)

  let created = 0
  for (const sem of semesters) {
    const rows = faculty.flatMap((f) =>
      WEEKDAYS.flatMap((day) =>
        BLOCKS.map((b) => ({
          facultyId: f.id,
          day: day as any,
          startTime: b.startTime,
          endTime: b.endTime,
          semesterId: sem.id,
        }))
      )
    )
    const res = await db.facultyAvailability.createMany({ data: rows as any, skipDuplicates: true })
    created += res.count
    console.log(`  ${sem.type} ${sem.academicYear?.label}: created ${res.count} of ${rows.length} rows`)
  }

  const withAvail = await db.faculty.count({
    where: { departmentId: cas.id, availability: { some: {} } },
  })
  console.log(`\nCAS faculty with availability: ${withAvail}/${faculty.length}`)
  console.log(`Total availability rows created: ${created}`)
  console.log("Saturday rows:", await db.facultyAvailability.count({ where: { day: "SATURDAY" } }))
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
