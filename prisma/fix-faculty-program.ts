import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

async function main() {
  const bsit = await db.program.findFirst({ where: { name: 'BS Information Technology' } })
  if (!bsit) { console.log('BSIT not found'); return }

  const stubFaculty = await db.faculty.findMany({
    where: { user: { OR: [
      { email: { endsWith: '@stub.local' } },
      { email: { endsWith: '@faculty.slsu.edu.ph' } },
    ] } },
    include: { user: true },
  })
  console.log(`Assigning ${stubFaculty.length} faculty to BSIT...`)
  for (const f of stubFaculty) {
    await db.faculty.update({ where: { id: f.id }, data: { programId: bsit.id } })
    console.log(`  ${(f as any).user.firstName} ${(f as any).user.lastName}`)
  }
  const count = await db.faculty.count({ where: { programId: bsit.id } })
  console.log(`\nBSIT faculty total: ${count}`)
}
main().finally(() => db.$disconnect())
