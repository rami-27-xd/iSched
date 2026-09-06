/**
 * Reads all ScheduleEntry rows from PUBLISHED (or any) schedules and
 * back-fills Faculty.specializations + Faculty.sectionCounts from what each
 * faculty member is actually assigned to teach.
 *
 * sectionCounts shape: { "Subject Title": numberOfDistinctSections }
 *
 * Run: npx tsx prisma/sync-faculty-specializations.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  // Pull every schedule entry that has a real facultyId, along with the
  // subject title and sectionId so we can aggregate.
  const entries = await db.scheduleEntry.findMany({
    where: {
      facultyId: { not: "" },
      schedule: { status: { in: ["PUBLISHED", "PENDING_APPROVAL", "DRAFT"] } },
    },
    select: {
      facultyId: true,
      sectionId: true,
      subject: { select: { title: true } },
    },
  })

  console.log(`Processing ${entries.length} schedule entries...`)

  // Group by facultyId → subject title → Set of sectionIds
  const map = new Map<string, Map<string, Set<string>>>()

  for (const e of entries) {
    const title = e.subject?.title
    if (!title || !e.facultyId) continue

    if (!map.has(e.facultyId)) map.set(e.facultyId, new Map())
    const subjectMap = map.get(e.facultyId)!

    if (!subjectMap.has(title)) subjectMap.set(title, new Set())
    subjectMap.get(title)!.add(e.sectionId)
  }

  console.log(`Found assigned entries for ${map.size} faculty members.`)

  let updated = 0
  for (const [facultyId, subjectMap] of map) {
    const specializations: string[] = []
    const sectionCounts: Record<string, number> = {}

    for (const [title, sections] of subjectMap) {
      specializations.push(title)
      sectionCounts[title] = sections.size
    }

    // Sort for consistent ordering
    specializations.sort()

    await db.faculty.update({
      where: { id: facultyId },
      data: { specializations, sectionCounts },
    })

    updated++
    if (updated % 10 === 0) process.stdout.write(`  Updated ${updated}/${map.size}...\r`)
  }

  // Clear specializations for faculty with no entries at all
  const allFaculty = await db.faculty.findMany({ select: { id: true } })
  const unassigned = allFaculty.filter(f => !map.has(f.id))
  if (unassigned.length > 0) {
    await db.faculty.updateMany({
      where: { id: { in: unassigned.map(f => f.id) } },
      data: { specializations: [], sectionCounts: {} },
    })
    console.log(`\nCleared specializations for ${unassigned.length} unassigned faculty.`)
  }

  console.log(`\nDone — ${updated} faculty records updated.`)
}

main().catch(console.error).finally(() => db.$disconnect())
