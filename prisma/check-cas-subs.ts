import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  const depts = await db.department.findMany({ where: { college: { abbreviation: "CAS" } }, orderBy: { name: "asc" } })
  depts.forEach(d => console.log(d.id, "|", d.abbreviation, "|", d.name))
}

main().catch(console.error).finally(() => db.$disconnect())
