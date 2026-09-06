import { db } from '../lib/db'

const KEEP_DEPT_IDS = [
  'cmmzovtuu0008qkvu6u4ayhzs', // CIT
  'cmmzovtv10009qkvur7tude03', // CAS
]

async function main() {
  // Count first
  const count = await db.subject.count({
    where: { departmentId: { notIn: KEEP_DEPT_IDS } },
  })
  console.log(`Found ${count} subjects outside CIT/CAS — deleting...`)

  const result = await db.subject.deleteMany({
    where: { departmentId: { notIn: KEEP_DEPT_IDS } },
  })
  console.log(`Deleted ${result.count} subjects.`)
}

main().catch(console.error).finally(() => db.$disconnect())
