import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  // Check schedules
  const schedules = await db.schedule.findMany({
    select: { id: true, status: true, isArchived: true },
  })
  console.log("Schedules:", JSON.stringify(schedules, null, 2))

  // Check entries for rorbeta's faculty id
  const facultyId = "cmn8k0est0009l0vulvlrlkw9"
  const entries = await db.scheduleEntry.findMany({
    where: { facultyId },
    include: { schedule: { select: { status: true, isArchived: true } } },
  })
  console.log(`\nEntries for faculty ${facultyId}: ${entries.length}`)
  for (const e of entries) {
    console.log(`  ${e.id} | schedule: ${e.scheduleId} (${e.schedule.status}, archived=${e.schedule.isArchived}) | ${e.day} ${e.startTime}-${e.endTime}`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
