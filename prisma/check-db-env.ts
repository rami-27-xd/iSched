import * as dotenv from "dotenv"
dotenv.config({ path: "C:/iSched/.env" })

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

console.log("DATABASE_URL:", process.env.DATABASE_URL?.slice(0, 40))

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function main() {
  const count = await db.room.count()
  const deptRoomCount = await db.departmentRoom.count()
  console.log("Rooms:", count, "| DeptRoom rows:", deptRoomCount)
}
main().catch(e => console.error("DB ERROR:", e.message)).finally(() => db.$disconnect())
