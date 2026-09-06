import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const users = await db.user.findMany({
    include: { faculty: true },
    orderBy: { createdAt: 'desc' },
  })
  for (const u of users) {
    console.log(`${u.id} | ${u.firstName} ${u.lastName} | ${u.email} | ${u.role} | faculty: ${u.faculty?.id ?? 'NONE'}`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
