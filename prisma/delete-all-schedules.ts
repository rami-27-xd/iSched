import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function main() {
  const count = await db.schedule.count()
  console.log(`Deleting ${count} schedule(s) and all related entries...`)

  const deleted = await db.schedule.deleteMany({})

  console.log(`Done. ${deleted.count} schedule(s) deleted.`)
  console.log("ScheduleEntry, UnassignedEntry, and ConflictLog rows were cascade-deleted.")
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
