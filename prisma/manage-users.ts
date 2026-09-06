import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' })
const db = new PrismaClient({ adapter })

async function main() {
  const action = process.argv[2] // 'list' or 'delete'
  const keepEmail = 'rorbeta@slsu.edu.ph'

  const users = await db.user.findMany({
    select: { id: true, email: true, firstName: true, lastName: true, role: true, supabaseId: true },
  })

  console.log('All users:')
  users.forEach((u) => console.log(`  ${u.email} | ${u.role} | ${u.id}`))

  if (action === 'delete') {
    const toDelete = users.filter((u) => u.email !== keepEmail)
    const ids = toDelete.map((u) => u.id)
    console.log(`\nDeleting ${toDelete.length} user(s)...`)

    // Delete in dependency order
    await db.$executeRawUnsafe(`DELETE FROM "ProgramHead" WHERE "userId" = ANY($1::text[])`, ids)
    await db.$executeRawUnsafe(`DELETE FROM "DepartmentChair" WHERE "userId" = ANY($1::text[])`, ids)
    await db.$executeRawUnsafe(`DELETE FROM "Faculty" WHERE "userId" = ANY($1::text[])`, ids)
    await db.$executeRawUnsafe(`DELETE FROM "Notification" WHERE "userId" = ANY($1::text[])`, ids)
    await db.$executeRawUnsafe(`DELETE FROM "FacultyBuildingAvailability" WHERE "facultyId" = ANY($1::text[])`, ids)
    await db.$executeRawUnsafe(`DELETE FROM "User" WHERE "id" = ANY($1::text[])`, ids)

    toDelete.forEach((u) => console.log(`  Deleted: ${u.email}`))
    console.log('Done.')
  }
}

main().finally(() => db.$disconnect())
