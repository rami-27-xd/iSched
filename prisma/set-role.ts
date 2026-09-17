/**
 * Fast local-testing helper: set an EXISTING user's role/department/approval
 * directly in the DB, bypassing sign-up + email confirmation. The user must
 * already exist (i.e. you've signed up once with this email through the real
 * sign-up form) — this only changes what account they land in.
 *
 * Usage:
 *   npx tsx --env-file=.env prisma/set-role.ts <email> <ROLE> [deptAbbr]
 *
 * Examples:
 *   npx tsx --env-file=.env prisma/set-role.ts me@example.com DEAN CIT
 *   npx tsx --env-file=.env prisma/set-role.ts me@example.com SUPER_ADMIN CAS
 *   npx tsx --env-file=.env prisma/set-role.ts me@example.com PATHFIT
 *   npx tsx --env-file=.env prisma/set-role.ts me@example.com NSTP
 *   npx tsx --env-file=.env prisma/set-role.ts me@example.com ADMIN CIT
 *
 * Deliberately re-implements resolveAutoApproval's checks as plain warnings
 * (not blocks) so you can force a second Dean/PATHFIT/NSTP into existence for
 * testing the "should be refused" UI paths deliberately if you want to.
 * Always sets isApproved + isActive true so the account is usable immediately.
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "FACULTY", "DEAN", "PATHFIT", "NSTP"]

async function main() {
  const [, , email, role, deptAbbr] = process.argv
  if (!email || !role || !VALID_ROLES.includes(role)) {
    console.error(`Usage: npx tsx --env-file=.env prisma/set-role.ts <email> <${VALID_ROLES.join("|")}> [deptAbbr]`)
    process.exit(1)
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`No user found for ${email} — sign up once through the app first, then re-run this.`)
    process.exit(1)
  }

  let departmentId: string | null = user.departmentId
  if (deptAbbr) {
    const dept = await db.department.findFirst({ where: { abbreviation: deptAbbr } })
    if (!dept) {
      console.error(`No department with abbreviation "${deptAbbr}". Try CAS, CIT, CTE, CEN, CAM, CABHA, CAG.`)
      process.exit(1)
    }
    departmentId = dept.id
  } else if ((role === "SUPER_ADMIN" || role === "PATHFIT" || role === "NSTP") && !departmentId) {
    // These three always live in CAS.
    const cas = await db.department.findFirst({ where: { abbreviation: "CAS" } })
    departmentId = cas?.id ?? null
  }

  if (role === "DEAN" && departmentId) {
    const existingDean = await db.user.findFirst({
      where: { role: "DEAN", departmentId, isApproved: true, isActive: true, id: { not: user.id } },
    })
    if (existingDean) console.warn(`⚠ ${departmentId} already has a Dean (${existingDean.email}) — forcing a second one anyway (real sign-up would refuse this).`)
  }
  if (role === "PATHFIT" || role === "NSTP") {
    const existing = await db.user.findFirst({ where: { role, isApproved: true, isActive: true, id: { not: user.id } } })
    if (existing) console.warn(`⚠ A ${role} account already exists (${existing.email}) — forcing a second one anyway (real sign-up would refuse this).`)
  }

  const updated = await db.user.update({
    where: { email },
    data: { role: role as any, isApproved: true, isActive: true, ...(departmentId ? { departmentId } : {}) },
  })

  // DEAN/SUPER_ADMIN scoping relies on getUserDepartmentId(), which for
  // SUPER_ADMIN also checks the DepartmentChair relation — keep it in sync.
  if (role === "SUPER_ADMIN" && departmentId) {
    const existingByUser = await db.departmentChair.findUnique({ where: { userId: user.id } })
    const existingByDept = await db.departmentChair.findUnique({ where: { departmentId } })
    if (existingByUser) {
      if (!existingByDept || existingByDept.userId === user.id) {
        await db.departmentChair.update({ where: { userId: user.id }, data: { departmentId } })
      }
    } else if (!existingByDept) {
      await db.departmentChair.create({ data: { userId: user.id, departmentId } })
    }
  }

  const dept = departmentId ? await db.department.findUnique({ where: { id: departmentId } }) : null
  console.log(`✓ ${email} is now ${role}${dept ? ` in ${dept.name} (${dept.abbreviation})` : ""} — approved & active.`)
  console.log(`  Reload the app (or sign in again) to see the new role take effect.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
