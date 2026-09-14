/**
 * CIT test data: every CIT faculty member has program-matched specializations
 * (see seed-cit-specs-availability.ts) EXCEPT exactly one, who is left with
 * none — for demonstrating what the scheduler / Add Entry do with a faculty
 * member who has no specialization (they land in the Unassigned Queue and are
 * refused as a manual pick for major subjects).
 *
 *   1. Fills specializations for any CIT faculty still missing them (same
 *      program-scoped round-robin as the main seed).
 *   2. Clears specializations + sectionCounts for the designated faculty.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-cit-one-unassigned.ts
 *       (add UNASSIGNED="Lastname, Firstname" to pick someone else)
 */
import { db } from "../lib/db"

const TARGET = process.env.UNASSIGNED ?? "Zulueta, Efren" // BSInfoTech

async function main() {
  const cit = await db.department.findFirst({ where: { abbreviation: "CIT" } })
  if (!cit) throw new Error("CIT department not found")

  const subjects = await db.subject.findMany({
    where: { departmentId: cit.id },
    select: { title: true, programId: true },
    orderBy: { code: "asc" },
  })
  const byProgram = new Map<string, string[]>()
  const shared: string[] = []
  for (const s of subjects) {
    if (!s.title) continue
    if (s.programId) (byProgram.get(s.programId) ?? byProgram.set(s.programId, []).get(s.programId)!).push(s.title)
    else shared.push(s.title)
  }

  const faculty = await db.faculty.findMany({
    where: { departmentId: cit.id },
    select: { id: true, programId: true, specializations: true, user: { select: { firstName: true, lastName: true, role: true } } },
    orderBy: { employeeId: "asc" },
  })

  // 1. Fill anyone still empty (except the designated one).
  const [lastName, firstName] = TARGET.split(",").map((x) => x.trim())
  const target = faculty.find((f) => f.user.lastName === lastName && f.user.firstName === firstName)
  if (!target) throw new Error(`Faculty "${TARGET}" not found in CIT`)

  let filled = 0
  for (const f of faculty) {
    if (f.id === target.id || f.specializations.length > 0) continue
    const pool = (f.programId && byProgram.get(f.programId)?.length ? byProgram.get(f.programId)! : shared)
    const specs = pool.slice(0, Math.min(3, pool.length))
    if (specs.length === 0) continue
    await db.faculty.update({ where: { id: f.id }, data: { specializations: specs } })
    filled++
  }

  // 2. Exactly one unassigned.
  await db.faculty.update({ where: { id: target.id }, data: { specializations: [], sectionCounts: {} } })

  const unassigned = await db.faculty.findMany({
    where: { departmentId: cit.id, specializations: { isEmpty: true } },
    select: { user: { select: { firstName: true, lastName: true } } },
  })
  console.log(`Filled ${filled} previously-empty faculty.`)
  console.log(`CIT faculty without specializations (${unassigned.length}): ${unassigned.map((u) => `${u.user.lastName}, ${u.user.firstName}`).join("; ")}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
