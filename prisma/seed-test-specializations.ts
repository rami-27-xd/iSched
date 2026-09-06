/**
 * TEST DATA — gives every CAS faculty member a realistic set of specializations
 * so schedule generation has legal candidates to work with.
 *
 * Why only CAS: CIT faculty are already fully covered (210/210). CAS had 5 of 84,
 * and lib/services/scheduler.ts treats an empty specialization list as "can teach
 * nothing", so almost every CAS major subject landed in the Unassigned Queue.
 *
 * Scoping follows the cluster rules exactly — a faculty member is only ever given
 * subjects from THEIR cluster's programs:
 *
 *   Social Sciences                        → BA History, BA Psychology
 *   Languages, Literature, and Humanities  → BA Communication
 *   Mathematics and Natural Sciences       → BS Biology, BS Mathematics
 *
 * GEC/GEL are deliberately NOT assigned. The engine exempts them from the
 * specialization check entirely (`isGecSubject = subject.programId === null`), so
 * any faculty member with availability can already teach them — adding them here
 * would only inflate the Teaching Load figure on the Faculty page.
 *
 * Distribution: each subject is given COVERAGE specialists, handed out round-robin
 * so the load is even and the backtracking engine always has alternatives when its
 * first choice is busy.
 *
 * Non-destructive and idempotent: existing specializations are kept (union), so
 * re-running changes nothing and no hand-entered data is lost.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-test-specializations.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

// How many faculty should be able to teach each subject.
const COVERAGE = 3

// Never auto-assigned anywhere in the system — manually scheduled only.
const EXCLUDED = ["NSTP", "NST", "PATHFIT", "PATHFit"]

async function main() {
  const clusters = await db.facultyCluster.findMany({
    include: { programs: { select: { id: true, abbreviation: true } } },
    orderBy: { name: "asc" },
  })

  let totalAssigned = 0
  let totalFaculty = 0

  for (const cluster of clusters) {
    const programIds = cluster.programs.map((p) => p.id)
    if (programIds.length === 0) {
      console.log(`\n${cluster.name}: no programs assigned — skipped`)
      continue
    }

    // Majors of this cluster's programs only.
    const subjects = await db.subject.findMany({
      where: {
        programId: { in: programIds },
        AND: EXCLUDED.map((p) => ({ code: { not: { startsWith: p } } })),
      },
      select: { title: true },
      orderBy: { code: "asc" },
    })

    // Specializations are matched by TITLE, so dedupe on title.
    const titles = [...new Set(subjects.map((s) => s.title).filter(Boolean))]

    const faculty = await db.faculty.findMany({
      where: { clusterId: cluster.id, isActive: true },
      select: { id: true, specializations: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: { employeeId: "asc" },
    })

    console.log(`\n${cluster.name}`)
    console.log(`   programs : ${cluster.programs.map((p) => p.abbreviation).join(", ")}`)
    console.log(`   subjects : ${titles.length} distinct titles`)
    console.log(`   faculty  : ${faculty.length}`)

    if (faculty.length === 0 || titles.length === 0) {
      console.log("   nothing to assign — skipped")
      continue
    }

    // Round-robin: walk every (subject × coverage slot) pair, handing each to the
    // next faculty member in rotation. Even load, guaranteed coverage.
    const assignments = new Map<string, Set<string>>(faculty.map((f) => [f.id, new Set(f.specializations)]))
    let cursor = 0
    for (const title of titles) {
      for (let k = 0; k < Math.min(COVERAGE, faculty.length); k++) {
        assignments.get(faculty[cursor % faculty.length].id)!.add(title)
        cursor++
      }
    }

    for (const f of faculty) {
      const next = [...assignments.get(f.id)!].sort()
      if (next.length === f.specializations.length) continue
      await db.faculty.update({ where: { id: f.id }, data: { specializations: next } })
      totalAssigned += next.length - f.specializations.length
    }
    totalFaculty += faculty.length

    const counts = faculty.map((f) => assignments.get(f.id)!.size)
    console.log(`   assigned : ${Math.min(...counts)}–${Math.max(...counts)} subjects each`)
  }

  // Anyone left behind (no cluster set) — report rather than guess a cluster.
  const orphans = await db.faculty.findMany({
    where: { clusterId: null, isActive: true, department: { college: { abbreviation: "CAS" } } },
    select: { specializations: true, user: { select: { firstName: true, lastName: true } } },
  })
  if (orphans.length) {
    console.log(`\nCAS faculty with NO cluster (skipped — assign a cluster first):`)
    for (const o of orphans) {
      console.log(`   ${o.user.firstName} ${o.user.lastName} (${o.specializations.length} specializations)`)
    }
  }

  const remaining = await db.faculty.count({
    where: { isActive: true, specializations: { isEmpty: true } },
  })
  console.log(`\n─────────────────────────────────────────────`)
  console.log(`Faculty processed        : ${totalFaculty}`)
  console.log(`Specializations added    : ${totalAssigned}`)
  console.log(`Faculty still with none  : ${remaining}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
