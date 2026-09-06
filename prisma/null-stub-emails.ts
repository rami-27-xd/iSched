import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  // Preview: all faculty-linked users with emails, grouped by email pattern
  const all = await db.user.findMany({
    where: { faculty: { isNot: null }, email: { not: null } },
    select: { id: true, firstName: true, lastName: true, email: true, supabaseId: true },
    orderBy: { email: "asc" },
  })

  console.log(`Total faculty users with emails: ${all.length}`)

  const stubs = all.filter(u => u.supabaseId.startsWith("manual-"))
  const seeded = all.filter(u =>
    !u.supabaseId.startsWith("manual-") &&
    (u.email?.includes("@testfaculty.") || u.email?.includes("@faculty.slsu.edu.ph") || u.email?.includes("@stub."))
  )
  const real = all.filter(u =>
    !u.supabaseId.startsWith("manual-") &&
    !u.email?.includes("@testfaculty.") &&
    !u.email?.includes("@faculty.slsu.edu.ph") &&
    !u.email?.includes("@stub.")
  )

  console.log(`\nManual stubs (supabaseId = manual-*): ${stubs.length}`)
  stubs.forEach(u => console.log(`  ${u.firstName} ${u.lastName} → ${u.email}`))

  console.log(`\nSeeded/generated placeholder emails: ${seeded.length}`)
  seeded.forEach(u => console.log(`  ${u.firstName} ${u.lastName} → ${u.email} [${u.supabaseId.slice(0, 8)}]`))

  console.log(`\nReal emails (keep these): ${real.length}`)
  real.forEach(u => console.log(`  ${u.firstName} ${u.lastName} → ${u.email}`))

  // NULL out stubs + seeded placeholders
  const toNull = [...stubs, ...seeded]
  if (toNull.length === 0) {
    console.log("\nNothing to update.")
    return
  }

  console.log(`\nNulling out ${toNull.length} placeholder emails...`)
  const ids = toNull.map(u => u.id)
  const result = await db.user.updateMany({
    where: { id: { in: ids } },
    data: { email: null },
  })
  console.log(`Done — ${result.count} rows updated.`)
}

main().catch(console.error).finally(() => db.$disconnect())
