/**
 * Shows why the GEC gate counts what it counts for CIT:
 * every CIT program, whether it has an assigned Program Chair,
 * and whether that chair has a submitted schedule this semester.
 *
 * Run: npx tsx --env-file=.env prisma/check-cit-gate.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const citDept = await db.department.findFirstOrThrow({
    where: { abbreviation: "CIT" },
  })

  const programs = await db.program.findMany({
    where: { departmentId: citDept.id },
    include: { head: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
    orderBy: { name: "asc" },
  })

  const submitted = await db.schedule.findMany({
    where: {
      departmentId: citDept.id,
      status: { in: ["PENDING_APPROVAL", "PUBLISHED"] },
    },
    select: { createdBy: true, status: true },
  })
  const submitterIds = new Set(submitted.map(s => s.createdBy))

  console.log(`CIT programs (${programs.length} total):\n`)
  for (const p of programs) {
    const head = p.head
    const chairName = head ? `${head.user.firstName} ${head.user.lastName}` : "—"
    const hasSubmitted = head ? submitterIds.has(head.userId) : false
    const gateStatus = !head
      ? "NO CHAIR → excluded from gate"
      : hasSubmitted
        ? "submitted ✓"
        : "NOT submitted ✗ (blocks gate)"
    console.log(`  ${p.name.padEnd(45)} chair: ${chairName.padEnd(22)} ${gateStatus}`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
