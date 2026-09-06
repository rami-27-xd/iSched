/**
 * Diagnostic: checks CAS colleges, departments, clusters, programs, and user cluster assignments.
 * Run: npx tsx --env-file=.env prisma/check-cas-data.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  // 1. All CAS colleges
  const colleges = await db.college.findMany({ where: { abbreviation: "CAS" } })
  console.log("\n=== CAS Colleges ===")
  for (const c of colleges) console.log(`  ${c.id}  ${c.name}  (${c.abbreviation})`)

  // 2. All CAS departments
  const depts = await db.department.findMany({
    where: { college: { abbreviation: "CAS" } },
    include: { college: true },
  })
  console.log("\n=== CAS Departments ===")
  for (const d of depts) console.log(`  ${d.id}  ${d.name}  collegeId=${d.collegeId}`)

  // 3. All FacultyClusters and their collegeId
  const clusters = await db.facultyCluster.findMany({ include: { college: true, programs: true } })
  console.log("\n=== Faculty Clusters ===")
  for (const c of clusters) {
    console.log(`  ${c.id}  "${c.name}"  collegeId=${c.collegeId ?? "null"}  (${c.college?.abbreviation ?? "no college"})`)
    for (const p of c.programs) console.log(`      program: ${p.abbreviation}  ${p.name}`)
  }

  // 4. CAS programs and their clusterId
  const programs = await db.program.findMany({
    where: { department: { college: { abbreviation: "CAS" } } },
  })
  console.log("\n=== CAS Programs ===")
  for (const p of programs) console.log(`  ${p.id}  ${p.abbreviation}  clusterId=${p.clusterId ?? "null"}`)

  // 5. SUPER_ADMIN users and their clusterId
  const admins = await db.user.findMany({
    where: { role: "SUPER_ADMIN" },
    select: { id: true, firstName: true, lastName: true, clusterId: true, cluster: { select: { name: true } } },
  })
  console.log("\n=== SUPER_ADMIN users ===")
  for (const u of admins) console.log(`  ${u.firstName} ${u.lastName}  clusterId=${u.clusterId ?? "null"}  cluster=${u.cluster?.name ?? "none"}`)
}

main().catch(console.error).finally(() => db.$disconnect())
