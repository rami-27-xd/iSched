import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

// Assignments: email → new sub-department abbreviation
const ASSIGNMENTS: Record<string, string> = {
  "rorbeta@slsu.edu.ph": "SS",    // Social Sciences
  "ramielleorbeta@gmail.com": "MNS", // Mathematics and Natural Sciences
  // LLH (Languages, Literature, and Humanities) needs a 3rd SUPER_ADMIN account
}

async function main() {
  const subDepts = await db.department.findMany({
    where: { college: { abbreviation: "CAS" }, abbreviation: { not: "CAS" } },
  })
  const deptByAbbr: Record<string, string> = {}
  subDepts.forEach(d => { deptByAbbr[d.abbreviation] = d.id })
  console.log("Sub-departments:", JSON.stringify(deptByAbbr))

  const users = await db.user.findMany({
    where: { role: "SUPER_ADMIN" },
    include: { departmentChair: true },
  })

  for (const user of users) {
    const email = user.email ?? ""
    const targetAbbr = ASSIGNMENTS[email]
    if (!targetAbbr) {
      console.log(`SKIP: ${email} — no assignment in map`)
      continue
    }
    const targetDeptId = deptByAbbr[targetAbbr]
    if (!targetDeptId) {
      console.error(`ERROR: no dept found for ${targetAbbr}`)
      continue
    }

    const dc = (user as any).departmentChair
    if (dc) {
      await db.departmentChair.update({
        where: { id: dc.id },
        data: { departmentId: targetDeptId },
      })
      console.log(`UPDATED: ${email} → ${targetAbbr} [${targetDeptId.slice(0,8)}]`)
    } else {
      await db.departmentChair.create({
        data: { userId: user.id, departmentId: targetDeptId },
      })
      console.log(`CREATED: ${email} → ${targetAbbr} [${targetDeptId.slice(0,8)}]`)
    }
  }

  // Also update the User.departmentId field for quick lookups
  const updatedUsers = await db.user.findMany({
    where: { role: "SUPER_ADMIN" },
    include: { departmentChair: { include: { department: true } } },
  })
  for (const u of updatedUsers) {
    const dc = (u as any).departmentChair
    if (dc) {
      await db.user.update({
        where: { id: u.id },
        data: { departmentId: dc.departmentId },
      })
    }
  }
  console.log("\nDone. LLH (Languages, Literature, and Humanities) still needs a 3rd SUPER_ADMIN account.")
}

main().catch(console.error).finally(() => db.$disconnect())
