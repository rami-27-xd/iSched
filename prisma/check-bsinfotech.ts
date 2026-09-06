import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

async function main() {
  // Find sections that belong to BSInfoTech program
  const bsitSections = await db.section.findMany({
    where: { yearLevel: { program: { abbreviation: { contains: "Info" } } } },
    include: { yearLevel: { include: { program: { include: { department: { include: { college: true } } } } } } },
    take: 5,
  })
  console.log("BSInfoTech program:", bsitSections[0]?.yearLevel?.program?.name)
  console.log("College:", bsitSections[0]?.yearLevel?.program?.department?.college?.abbreviation)

  if (bsitSections.length === 0) {
    // Try different search
    const programs = await db.program.findMany({
      include: { department: { include: { college: true } } },
    })
    console.log("All programs:", programs.map(p => `${p.abbreviation} (${p.department?.college?.abbreviation})`))
    return
  }

  const sectionIds = bsitSections.map(s => s.id)

  // Find schedule entries for these sections
  const entries = await db.scheduleEntry.findMany({
    where: { sectionId: { in: sectionIds } },
    include: {
      subject: { include: { department: true, yearLevel: true } },
      section: { include: { yearLevel: { include: { program: true } } } },
    },
    take: 20,
  })

  console.log(`\nSchedule entries for BSInfoTech sections (${entries.length}):`)
  for (const e of entries) {
    console.log(`  ${e.subject.code} "${e.subject.title}" | type=${e.subject.type} | programId=${e.subject.programId ?? "null (GEC)"} | dept=${e.subject.department?.abbreviation} | section=${e.section.name}`)
  }

  // Show all subjects linked to BSInfoTech program
  const bsitProgram = bsitSections[0]?.yearLevel?.program
  if (bsitProgram) {
    const subjects = await db.subject.findMany({
      where: { programId: bsitProgram.id },
      select: { code: true, title: true, type: true, programId: true },
      orderBy: { code: "asc" },
    })
    console.log(`\nAll subjects for program ${bsitProgram.abbreviation} (${subjects.length}):`)
    subjects.forEach(s => console.log(`  ${s.code} "${s.title}" type=${s.type}`))
  }
}

main().catch(console.error).finally(() => db.$disconnect())
