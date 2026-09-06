import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  try {
    const rooms = await db.room.findMany({
      take: 2,
      include: {
        building: true,
        departments: { include: { department: true } },
        _count: { select: { scheduleEntries: true } },
      },
    })
    console.log("OK — fetched", rooms.length, "rooms")
    if (rooms[0]) {
      console.log("First room departments:", rooms[0].departments)
    }
  } catch (e: any) {
    console.error("ERROR:", e.message)
  }
}

main().finally(() => db.$disconnect())
