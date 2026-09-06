import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"
dotenv.config()
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const result = await db.user.update({
    where: { email: "rorbeta@slsu.edu.ph" },
    data: { role: "SUPER_ADMIN" },
    select: { id: true, email: true, firstName: true, lastName: true, role: true }
  })
  console.log("Fixed:", result)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
