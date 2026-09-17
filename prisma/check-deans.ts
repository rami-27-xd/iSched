/**
 * Which departments have (or lack) an approved, active Dean?
 *
 * Under the RBAC rules every Department / Program Chairperson account waits for
 * the Dean of its own department, so a department without a Dean can never get
 * a new chair approved. The first Dean of a department self-approves on sign-up;
 * this just reports where that still needs to happen, plus any chair accounts
 * already stuck pending there.
 *
 * Read-only. Targets whatever DATABASE_URL is set.
 * Run:  npx tsx --env-file=.env prisma/check-deans.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

async function main() {
  const departments = await db.department.findMany({
    include: {
      college: { select: { abbreviation: true } },
      users: {
        where: { isActive: true },
        select: { role: true, isApproved: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { abbreviation: "asc" },
  })

  let missing = 0
  for (const d of departments) {
    const deans = d.users.filter((u) => u.role === "DEAN" && u.isApproved)
    const pending = d.users.filter((u) => !u.isApproved && u.role !== "FACULTY")
    const flag = deans.length ? "✓" : "✗"
    if (!deans.length) missing++
    console.log(
      `${flag} ${d.abbreviation.padEnd(6)} ${d.college?.abbreviation?.padEnd(6) ?? "".padEnd(6)} ` +
        (deans.length ? `Dean: ${deans.map((u) => `${u.firstName} ${u.lastName}`).join(", ")}` : "NO DEAN") +
        (pending.length ? `   — ${pending.length} account(s) waiting: ${pending.map((u) => `${u.firstName} ${u.lastName} (${u.role})`).join(", ")}` : "")
    )
  }
  const singles = await db.user.findMany({ where: { role: { in: ["PATHFIT", "NSTP"] }, isActive: true }, select: { role: true, isApproved: true, firstName: true, lastName: true } })
  console.log(`\nPATHFit Director: ${singles.filter((u) => u.role === "PATHFIT").map((u) => `${u.firstName} ${u.lastName}${u.isApproved ? "" : " (pending)"}`).join(", ") || "none yet"}`)
  console.log(`NSTP Director:    ${singles.filter((u) => u.role === "NSTP").map((u) => `${u.firstName} ${u.lastName}${u.isApproved ? "" : " (pending)"}`).join(", ") || "none yet"}`)
  console.log(`\n${departments.length - missing} of ${departments.length} departments have a Dean.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
