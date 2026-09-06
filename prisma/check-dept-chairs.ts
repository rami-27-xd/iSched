import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  const admins = await db.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    include: {
      departmentChair: { include: { department: { include: { college: true } } } },
      programHead: { include: { program: { include: { department: { include: { college: true } } } } } },
    },
    orderBy: { role: "asc" },
  })

  for (const u of admins) {
    const deptChair = (u as any).departmentChair
    const progHead = (u as any).programHead
    const deptInfo = deptChair?.department
      ? `${deptChair.department.college.abbreviation}/${deptChair.department.abbreviation} — "${deptChair.department.name}" [${deptChair.departmentId.slice(0,8)}]`
      : "NO departmentChair record"
    const progInfo = progHead?.program
      ? `${progHead.program.department.college.abbreviation}/${progHead.program.abbreviation}`
      : "—"
    console.log(`[${u.role}] ${u.name} (${u.email ?? "no email"})`)
    console.log(`   dept: ${deptInfo}`)
    if (u.role === "ADMIN") console.log(`   prog: ${progInfo}`)
  }

  // Show all CAS sub-departments for reference
  console.log("\nCAS sub-departments:")
  const depts = await db.department.findMany({ where: { college: { abbreviation: "CAS" } }, orderBy: { name: "asc" } })
  depts.forEach(d => console.log(`  [${d.id.slice(0,8)}] ${d.abbreviation} — "${d.name}"`))
}

main().catch(console.error).finally(() => db.$disconnect())
