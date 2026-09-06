/**
 * Adds 20 name-only faculty (no email, no specialization, no availability)
 * for EACH current Department Chairperson / Program Chairperson.
 *
 *  - SUPER_ADMIN (CAS Dept Chair): faculty get departmentId=CAS + that chair's
 *    clusterId, programId=null (dept/cluster-wide pool) — matches the cluster
 *    scoping GET /api/faculty already enforces for CAS.
 *  - ADMIN (Program Chair): faculty get departmentId=<their dept> + that
 *    chair's programId (Faculty.programId = "assigned to a specific program").
 *
 * Run:  npx tsx --env-file=.env prisma/seed-20-per-chair.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const FIRST_NAMES = [
  "Rene","Cynthia","Domingo","Perla","Rodel","Angelina","Bayani","Corazon","Efren","Ligaya",
  "Florante","Imelda","Gregorio","Adelina","Hernani","Juanita","Isagani","Katrina","Leopoldo","Mercedes",
  "Nestor","Ofelia","Porfirio","Querubin","Rosalinda","Severino","Trinidad","Ubaldo","Veronica","Wenceslao",
  "Ximena","Yolanda","Zosimo","Alfonso","Benedicta","Crispin","Delfin","Estrella","Filomena","Guillermo",
]
const LAST_NAMES = [
  "Aquino","Bonifacio","Cabrera","Diaz","Estrada","Fajardo","Guevarra","Hilario","Ignacio","Jimenez",
  "Katindig","Lacsamana","Manalo","Nolasco","Obando","Pineda","Quijano","Ramirez","Serrano","Tan",
  "Umali","Vergara","Wenceslao","Yabut","Zulueta","Abrigo","Baltazar","Cortez","Deleon","Espino",
  "Fabros","Galvez","Hidalgo","Isidro","Jacinto","Kalaw","Legaspi","Montes","Nazareno","Ochoa",
]

// Generate a shuffled list of unique (first,last) combos, more than we need.
function generateNamePool(count: number): [string, string][] {
  const combos: [string, string][] = []
  for (const f of FIRST_NAMES) for (const l of LAST_NAMES) combos.push([f, l])
  // Deterministic shuffle (seeded) so re-runs are reproducible-ish; good enough for seed data.
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[combos[i], combos[j]] = [combos[j], combos[i]]
  }
  return combos.slice(0, count)
}

async function main() {
  const chairs = await db.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: {
      id: true, firstName: true, lastName: true, role: true, departmentId: true, clusterId: true,
      programHead: { select: { programId: true } },
    },
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
  })

  console.log(`Found ${chairs.length} chairs. Adding 20 faculty each (${chairs.length * 20} total).\n`)

  const pool = generateNamePool(chairs.length * 20 + 40) // spare combos in case of collisions
  let poolIdx = 0

  let totalCreated = 0

  for (const chair of chairs) {
    if (!chair.departmentId) {
      console.log(`!! ${chair.firstName} ${chair.lastName} has no department — skipped`)
      continue
    }

    const clusterId = chair.role === "SUPER_ADMIN" ? (chair.clusterId ?? null) : null
    const programId = chair.role === "ADMIN" ? (chair.programHead?.programId ?? null) : null

    console.log(`${chair.role === "SUPER_ADMIN" ? "Dept Chair" : "Program Chair"} ${chair.firstName} ${chair.lastName}`)

    let createdForChair = 0
    while (createdForChair < 20) {
      const [firstName, lastName] = pool[poolIdx++]
      if (poolIdx >= pool.length) throw new Error("Ran out of name combinations")

      // Skip if this exact person already exists anywhere (avoid confusing dupes).
      const existing = await db.user.findFirst({ where: { firstName, lastName, role: "FACULTY" } })
      if (existing) continue

      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const user = await db.user.create({
        data: {
          supabaseId: `manual-${suffix}`,
          email: null,
          firstName,
          lastName,
          role: "FACULTY",
          isApproved: false,
          departmentId: chair.departmentId,
        },
      })

      await db.faculty.create({
        data: {
          userId: user.id,
          departmentId: chair.departmentId,
          ...(clusterId ? { clusterId } : {}),
          ...(programId ? { programId } : {}),
          employeeId: `FAC-${suffix}`,
          specializations: [],
          sectionCounts: {},
          maxUnitsPerWeek: 21,
          hoursPerWeek: 0,
          isActive: true,
        },
      })

      createdForChair++
      totalCreated++
    }
    console.log(`   -> created 20 (scope: dept=${chair.departmentId}${clusterId ? `, cluster=${clusterId}` : ""}${programId ? `, program=${programId}` : ""})`)
  }

  console.log(`\nDone. Created ${totalCreated} faculty across ${chairs.length} chairs.`)
  console.log("Total faculty now:", await db.faculty.count())
  console.log("Total users now:", await db.user.count())
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
