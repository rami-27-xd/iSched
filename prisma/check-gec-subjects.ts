import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  const GEC_PREFIXES = ["GEC", "GEL", "PATHFIT", "PATHFit", "NST"]

  // GEC subjects = programId null + GEC prefix codes
  const gecSubjects = await db.subject.findMany({
    where: {
      OR: GEC_PREFIXES.map(p => ({ code: { startsWith: p } })),
    },
    include: { department: { include: { college: true } } },
    orderBy: { code: "asc" },
  })

  console.log(`GEC subjects in DB: ${gecSubjects.length}`)
  gecSubjects.forEach(s =>
    console.log(`  ${s.code} "${s.title}" | dept=${s.department?.abbreviation ?? "NONE"} | college=${s.department?.college?.abbreviation ?? "NONE"} | programId=${s.programId ?? "null"}`)
  )

  // Also show all subjects with programId = null (dept-wide, not program-specific)
  const deptWide = await db.subject.findMany({
    where: { programId: null },
    include: { department: { include: { college: true } } },
    orderBy: { code: "asc" },
  })
  console.log(`\nAll programId=null subjects (${deptWide.length}):`)
  deptWide.forEach(s =>
    console.log(`  ${s.code} "${s.title}" | dept=${s.department?.abbreviation ?? "NONE"} | college=${s.department?.college?.abbreviation ?? "NONE"}`)
  )
}

main().catch(console.error).finally(() => db.$disconnect())
