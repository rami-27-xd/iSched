import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const programs = await db.program.findMany({ orderBy: { id: "asc" } })
  const seen = new Map<string, string>()
  const dupeIds: string[] = []

  for (const p of programs) {
    const key = `${p.abbreviation}::${p.departmentId}`
    if (seen.has(key)) {
      dupeIds.push(p.id)
    } else {
      seen.set(key, p.id)
    }
  }

  console.log(`Total programs: ${programs.length}, Duplicates: ${dupeIds.length}`)

  if (dupeIds.length > 0) {
    for (const pid of dupeIds) {
      const yls = await db.yearLevel.findMany({ where: { programId: pid } })
      for (const yl of yls) {
        await db.section.deleteMany({ where: { yearLevelId: yl.id } })
      }
      await db.yearLevel.deleteMany({ where: { programId: pid } })
      await db.program.delete({ where: { id: pid } })
    }
    console.log(`Deleted ${dupeIds.length} duplicate programs and their year levels/sections`)
  }

  console.log(`Remaining programs: ${await db.program.count()}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
