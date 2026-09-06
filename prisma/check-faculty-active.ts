import { db } from '../lib/db'

async function main() {
  const faculty = await db.faculty.findMany({
    include: { user: { select: { firstName: true, lastName: true, isActive: true } } },
  })
  for (const f of faculty) {
    console.log(
      `${f.user.firstName} ${f.user.lastName}`,
      '| Faculty.isActive:', f.isActive,
      '| User.isActive:', f.user.isActive
    )
  }
}
main().catch(console.error).finally(() => db.$disconnect())
