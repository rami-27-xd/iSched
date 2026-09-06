/**
 * Seed CAS Faculty Clusters (Department Head areas).
 * These represent the three academic sub-divisions within CAS that each
 * Department Head oversees. After running, they appear in the "Department
 * Head Area" dropdown when assigning a SUPER_ADMIN to the CAS department.
 *
 * Run: npx tsx --env-file=.env prisma/seed-cas-clusters.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

const CAS_CLUSTERS = [
  { name: "Social Sciences",                          description: "BA History, BA Psychology, BA Communication" },
  { name: "Languages, Literature, and Humanities",    description: "Language and communication-focused programs" },
  { name: "Mathematics and Natural Sciences",         description: "BS Biology, BS Mathematics" },
]

async function main() {
  const casCollege = await db.college.findFirstOrThrow({ where: { abbreviation: "CAS" } })
  console.log(`Seeding clusters for ${casCollege.name} (${casCollege.id})`)

  for (const c of CAS_CLUSTERS) {
    const cluster = await db.facultyCluster.upsert({
      where: { name: c.name },
      update: { description: c.description, collegeId: casCollege.id },
      create: { name: c.name, description: c.description, collegeId: casCollege.id },
    })
    console.log(`  ✓ ${cluster.name}`)
  }

  console.log("Done.")
}

main().catch(console.error).finally(() => db.$disconnect())
