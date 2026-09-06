/**
 * Removes cross-department contamination from schedules: any entry (or
 * unassigned-queue row) whose section belongs to a program OUTSIDE the
 * schedule's own department is stale data from pre-isolation generations.
 *
 * GEC entries survive — they attach to the schedule's own dept sections.
 *
 * Run: npx tsx --env-file=.env prisma/cleanup-cross-dept-entries.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const schedules = await db.schedule.findMany({
    where: { departmentId: { not: null } },
    include: { department: { select: { abbreviation: true } } },
  })

  for (const s of schedules) {
    // Entries whose section's program lives in a DIFFERENT department
    const staleWhere = {
      scheduleId: s.id,
      section: {
        yearLevel: { program: { departmentId: { not: s.departmentId! } } },
      },
    }

    const stale = await db.scheduleEntry.findMany({
      where: staleWhere,
      include: {
        subject: { select: { code: true } },
        section: { select: { name: true } },
      },
    })

    const staleUnassigned = await db.unassignedEntry.count({
      where: staleWhere as any,
    })

    if (stale.length === 0 && staleUnassigned === 0) {
      console.log(`Schedule ${s.id.slice(-6)} (${s.department?.abbreviation}): clean`)
      continue
    }

    const preview = stale.slice(0, 5).map(e => `${e.subject?.code}→${e.section?.name}`).join(", ")
    console.log(`Schedule ${s.id.slice(-6)} (${s.department?.abbreviation}): removing ${stale.length} entries + ${staleUnassigned} unassigned rows`)
    console.log(`  e.g. ${preview}${stale.length > 5 ? ` ...and ${stale.length - 5} more` : ""}`)

    await db.scheduleEntry.deleteMany({ where: staleWhere })
    await db.unassignedEntry.deleteMany({ where: staleWhere as any })
  }

  console.log("\nDone.")
}

main().catch(console.error).finally(() => db.$disconnect())
