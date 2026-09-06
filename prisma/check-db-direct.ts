import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function main() {
  const rooms = await db.room.findMany({ take: 2, include: { departments: true, building: true } })
  console.log("Rooms:", rooms.length)
  console.log("Table exists? YES")
  const blds = await db.building.findMany({ take: 2 })
  console.log("Buildings:", blds.length)
}
main().catch(console.error).finally(() => db.$disconnect())
