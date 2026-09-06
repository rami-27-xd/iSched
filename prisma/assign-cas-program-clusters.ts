/**
 * Assigns each CAS program to its Faculty Cluster.
 * Run AFTER seed-cas-clusters.ts and after the Prisma migration that adds Program.clusterId.
 *
 * Cluster → Programs:
 *   Social Sciences                    → BA History, BA Psychology
 *   Languages, Literature, Humanities  → BA Communication
 *   Mathematics and Natural Sciences   → BS Biology, BS Mathematics
 *
 * Run: npx tsx --env-file=.env prisma/assign-cas-program-clusters.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

const CLUSTER_PROGRAMS: Record<string, string[]> = {
  "Social Sciences": ["BA History", "BA Psychology"],
  "Languages, Literature, and Humanities": ["BA Communication"],
  "Mathematics and Natural Sciences": ["BS Biology", "BS Mathematics"],
}

async function main() {
  const casCollege = await db.college.findFirstOrThrow({ where: { abbreviation: "CAS" } })
  const casDept = await db.department.findFirstOrThrow({ where: { collegeId: casCollege.id } })
  console.log(`Working in ${casCollege.name} / ${casDept.name} (${casDept.id})`)

  for (const [clusterName, programNames] of Object.entries(CLUSTER_PROGRAMS)) {
    const cluster = await db.facultyCluster.findUnique({ where: { name: clusterName } })
    if (!cluster) {
      console.warn(`  ⚠ Cluster not found: "${clusterName}" — run seed-cas-clusters.ts first`)
      continue
    }
    console.log(`\nCluster: ${clusterName} (${cluster.id})`)

    for (const progName of programNames) {
      const program = await db.program.findFirst({
        where: {
          departmentId: casDept.id,
          name: { contains: progName, mode: "insensitive" },
        },
      })
      if (!program) {
        console.warn(`  ⚠ Program not found: "${progName}"`)
        continue
      }
      await db.program.update({
        where: { id: program.id },
        data: { clusterId: cluster.id },
      })
      console.log(`  ✓ ${program.abbreviation} — ${program.name}`)
    }
  }

  console.log("\nDone.")
}

main().catch(console.error).finally(() => db.$disconnect())
