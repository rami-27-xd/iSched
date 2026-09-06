// Copies availability from the active semester (2026-2027 FIRST) to the schedule's semester
// (2025-2026 FIRST) for all faculty who have availability in the wrong one.
import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

const SOURCE_SEMESTER = 'cmn1ew50k00009wvupqgsajj9'   // 2026-2027 FIRST (where new faculty were seeded)
const TARGET_SEMESTER = 'cmmzojoqa0001sgvuvxld5gxr'   // 2025-2026 FIRST (the active schedule's semester)

async function main() {
  // Get all faculty with availability in SOURCE but not TARGET
  const bsit = await db.program.findFirst({ where: { name: 'BS Information Technology' } })
  const allFaculty = await db.faculty.findMany({
    where: { programId: bsit?.id, isActive: true },
    include: {
      user: true,
      availability: { where: { semesterId: SOURCE_SEMESTER } },
    },
  })

  let copied = 0, skipped = 0

  for (const fac of allFaculty) {
    if ((fac.availability as any[]).length === 0) { skipped++; continue }

    // Check if already has TARGET availability
    const hasTarget = await db.facultyAvailability.count({
      where: { facultyId: fac.id, semesterId: TARGET_SEMESTER },
    })
    if (hasTarget > 0) { skipped++; continue }

    for (const avail of fac.availability as any[]) {
      await db.facultyAvailability.upsert({
        where: {
          facultyId_day_startTime_semesterId: {
            facultyId: fac.id,
            day: avail.day,
            startTime: avail.startTime,
            semesterId: TARGET_SEMESTER,
          },
        },
        update: { endTime: avail.endTime },
        create: {
          facultyId: fac.id,
          day: avail.day,
          startTime: avail.startTime,
          endTime: avail.endTime,
          semesterId: TARGET_SEMESTER,
        },
      })
      copied++
    }
    const u = (fac as any).user
    console.log(`  Copied ${(fac.availability as any[]).length} slots for ${u.firstName} ${u.lastName}`)
  }

  console.log(`\nDone: ${copied} slots copied, ${skipped} faculty skipped (already have target or no availability)`)

  // Verify
  const withTarget = await db.faculty.count({
    where: {
      programId: bsit?.id,
      isActive: true,
      availability: { some: { semesterId: TARGET_SEMESTER } },
    },
  })
  console.log(`Faculty with availability in target semester: ${withTarget} / ${allFaculty.length}`)
}

main().finally(() => db.$disconnect())
