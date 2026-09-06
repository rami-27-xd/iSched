/**
 * Seed GEC/GEL subjects into the parent CAS department.
 * All GEC subjects belong to CAS — there are no SS/LLH/MNS sub-departments.
 *
 * Run: npx tsx --env-file=.env prisma/seed-gec-subjects.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

type GecSubject = {
  code: string
  title: string
  units: number
  semester: "FIRST" | "SECOND"
  year: number
}

const GEC_SUBJECTS: GecSubject[] = [
  // Year 1 — 1st Semester
  { code: "GEC02",  title: "Understanding the Self",                          units: 3, semester: "FIRST",  year: 1 },
  { code: "GEC03",  title: "Readings in the Philippine History",              units: 3, semester: "FIRST",  year: 1 },
  { code: "GEC04",  title: "The Contemporary World",                          units: 3, semester: "FIRST",  year: 1 },
  { code: "GEC06",  title: "Purposive Communication",                         units: 3, semester: "FIRST",  year: 1 },
  { code: "GEC08",  title: "Science, Technology and Society",                 units: 3, semester: "FIRST",  year: 1 },
  { code: "GEC10",  title: "Kontekstwalisadong Komunikasyon sa Filipino",     units: 3, semester: "FIRST",  year: 1 },
  // Year 1 — 2nd Semester
  { code: "GEC01",  title: "The Life and Works of Rizal",                     units: 3, semester: "SECOND", year: 1 },
  { code: "GEC05",  title: "Mathematics in the Modern World",                 units: 3, semester: "SECOND", year: 1 },
  { code: "GEC11",  title: "Filipino sa Iba't Ibang Disiplina",               units: 3, semester: "SECOND", year: 1 },
  // Year 2 — 1st Semester
  { code: "GEC07",  title: "Art Appreciation",                                units: 3, semester: "FIRST",  year: 2 },
  { code: "GEC09",  title: "Ethics",                                          units: 3, semester: "SECOND", year: 2 },
  { code: "GEL07",  title: "Gender and Society",                              units: 3, semester: "FIRST",  year: 2 },
  { code: "GEL10",  title: "Philippine Popular Culture",                      units: 3, semester: "FIRST",  year: 2 },
  // Year 2 — 2nd Semester
  { code: "GEC13",  title: "Literature of the Philippines",                   units: 3, semester: "SECOND", year: 2 },
  { code: "GEC14",  title: "Literature of the World",                         units: 3, semester: "SECOND", year: 2 },
  { code: "GEL01",  title: "Environmental Science",                           units: 3, semester: "SECOND", year: 2 },
  // Year 3
  { code: "GEC12",  title: "Dalumat ng/sa Filipino",                          units: 3, semester: "FIRST",  year: 3 },
]

async function main() {
  console.log("Seeding GEC/GEL subjects into CAS department...")

  const casDept = await db.department.findFirstOrThrow({ where: { abbreviation: "CAS" } })
  console.log(`Target: ${casDept.name} (${casDept.id})`)

  let count = 0
  for (const s of GEC_SUBJECTS) {
    await db.subject.upsert({
      where:  { code_departmentId: { code: s.code, departmentId: casDept.id } },
      update: { title: s.title, units: s.units, hoursPerWeek: s.units, semester: s.semester, year: s.year },
      create: {
        code:         s.code,
        title:        s.title,
        units:        s.units,
        hoursPerWeek: s.units,
        type:         "LECTURE",
        semester:     s.semester,
        year:         s.year,
        departmentId: casDept.id,
        programId:    null,
      },
    })
    count++
  }

  console.log(`Done. ${count} GEC/GEL subjects upserted into CAS.`)
}

main().catch(console.error).finally(() => db.$disconnect())
