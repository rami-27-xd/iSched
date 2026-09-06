/**
 * Seeds 20 plain faculty records: name only — no email, no specializations.
 *
 * Faculty are stub (non-login) records, so each gets a "manual-" supabaseId and
 * a null email, matching what POST /api/faculty creates for a name-only entry.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-20-faculty.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const NAMES: [string, string][] = [
  ["Ramon", "Bautista"],
  ["Liza", "Fernandez"],
  ["Alfredo", "Mercado"],
  ["Corazon", "Villamor"],
  ["Ernesto", "Salazar"],
  ["Marilou", "Aguinaldo"],
  ["Benigno", "Tolentino"],
  ["Editha", "Rosales"],
  ["Rogelio", "Panganiban"],
  ["Nenita", "Concepcion"],
  ["Armando", "Valdez"],
  ["Purificacion", "Cordero"],
  ["Salvador", "Bermudez"],
  ["Lourdes", "Alcantara"],
  ["Fernando", "Zamora"],
  ["Remedios", "Gatchalian"],
  ["Antonio", "Escobar"],
  ["Josefina", "Marquez"],
  ["Ricardo", "Enriquez"],
  ["Amelia", "Bringas"],
]

async function main() {
  // Default pool: CAS (the Department Chair's department for GEC scheduling).
  const dept = await db.department.findFirst({ where: { abbreviation: "CAS" } })
  if (!dept) throw new Error("CAS department not found — seed departments first.")

  // CAS Dept Chairs only see their own cluster's faculty, so seeded records must
  // carry a cluster or they'd be invisible to every chair.
  const cluster = await db.facultyCluster.findFirst({ where: { name: "Social Sciences" } })
  if (!cluster) throw new Error("Social Sciences cluster not found — seed clusters first.")

  console.log(`Adding ${NAMES.length} faculty to ${dept.abbreviation} (${dept.name}) / ${cluster.name}\n`)

  let created = 0
  let skipped = 0

  for (const [firstName, lastName] of NAMES) {
    // Skip if a faculty with this exact name already exists in the department.
    const existing = await db.faculty.findFirst({
      where: { departmentId: dept.id, user: { firstName, lastName } },
    })
    if (existing) {
      console.log(`  – skipped (already exists): ${firstName} ${lastName}`)
      skipped++
      continue
    }

    const suffix = Math.random().toString(36).slice(2, 8)
    const user = await db.user.create({
      data: {
        supabaseId: `manual-${Date.now()}-${suffix}`,
        email: null,
        firstName,
        lastName,
        role: "FACULTY",
        isApproved: false,
        departmentId: dept.id,
      },
    })

    await db.faculty.create({
      data: {
        userId: user.id,
        departmentId: dept.id,
        clusterId: cluster.id,
        employeeId: `FAC-${Date.now()}-${suffix}`,
        specializations: [],
        sectionCounts: {},
        maxUnitsPerWeek: 21,
        hoursPerWeek: 0,
        isActive: true,
      },
    })

    console.log(`  ✓ ${firstName} ${lastName}`)
    created++
  }

  console.log(`\nCreated ${created}, skipped ${skipped}.`)
  console.log("Total faculty now:", await db.faculty.count())
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
