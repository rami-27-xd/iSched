/**
 * Tag CAS faculty with the general-education subjects of their cluster.
 *
 * There is no GEC exemption in specialization matching any more: a CAS faculty
 * member can only be assigned (by the generator or by hand) to a GEC/GEL subject
 * they are tagged for. This seeds test data in the form chairs use —
 * "GEC01 - Understanding the Self" — for every active CAS faculty member, using
 * the cluster ↔ GEC ownership in lib/services/subject-permissions.ts:
 *
 *   Social Sciences                        → GEC01-04, GEC09, GEL07, GEL10
 *   Languages, Literature, and Humanities  → GEC06, GEC07, GEC10-14
 *   Mathematics and Natural Sciences       → GEC05, GEC08, GEL01, GEL04, GEL05, GEL08
 *
 * Existing specializations are kept; only missing tags are added (re-runnable).
 * Faculty with no cluster are skipped and listed. Targets whatever DATABASE_URL
 * is set — point it at the Supabase session-pooler URL to seed production.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-cas-gec-specializations.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

// Mirrors CLUSTER_GEC_CODES (lib/services/subject-permissions.ts) — kept inline so the
// seed has no app imports.
const CLUSTER_GEC_CODES: Record<string, string[]> = {
  "Social Sciences": ["GEC01", "GEC02", "GEC03", "GEC04", "GEC09", "GEL07", "GEL10"],
  "Languages, Literature, and Humanities": ["GEC06", "GEC07", "GEC10", "GEC11", "GEC12", "GEC13", "GEC14"],
  "Mathematics and Natural Sciences": ["GEC05", "GEC08", "GEL01", "GEL04", "GEL05", "GEL08"],
}

async function main() {
  const cas = await db.department.findFirst({ where: { abbreviation: "CAS" } })
  if (!cas) throw new Error("CAS department not found")

  const subjects = await db.subject.findMany({
    where: { departmentId: cas.id, programId: null, OR: [{ code: { startsWith: "GEC" } }, { code: { startsWith: "GEL" } }] },
    select: { code: true, title: true },
  })
  const titleByCode = new Map(subjects.map((s) => [s.code.toUpperCase(), s.title]))

  const clusters = await db.facultyCluster.findMany({ select: { id: true, name: true } })
  const clusterName = new Map(clusters.map((c) => [c.id, c.name]))

  const faculty = await db.faculty.findMany({
    where: { departmentId: cas.id, isActive: true, employeeId: { not: "TBA" } },
    select: { id: true, clusterId: true, specializations: true, user: { select: { firstName: true, lastName: true } } },
  })

  let updated = 0
  let tagsAdded = 0
  const skipped: string[] = []
  for (const f of faculty) {
    const name = `${f.user.firstName} ${f.user.lastName}`.trim()
    const cname = f.clusterId ? clusterName.get(f.clusterId) : undefined
    const codes = cname ? CLUSTER_GEC_CODES[cname] : undefined
    if (!codes) {
      skipped.push(name)
      continue
    }
    const existing = new Set(f.specializations.map((s) => s.trim().toUpperCase()))
    const add: string[] = []
    for (const code of codes) {
      const title = titleByCode.get(code)
      if (!title) continue
      const alreadyTagged = [...existing].some((s) => s === code || s.startsWith(`${code} `) || s.startsWith(`${code}-`) || s === title.toUpperCase())
      if (!alreadyTagged) add.push(`${code} - ${title}`)
    }
    if (add.length === 0) continue
    await db.faculty.update({ where: { id: f.id }, data: { specializations: [...f.specializations, ...add] } })
    updated++
    tagsAdded += add.length
    console.log(`  ${name.padEnd(28)} +${add.length}  (${cname})`)
  }

  console.log(`\n${updated} faculty updated, ${tagsAdded} GEC/GEL tags added.`)
  if (skipped.length) console.log(`Skipped (no cluster): ${skipped.join(", ")}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
