/**
 * Restore the three CAS sub-departments (SS, LLH, MNS) so that each CAS
 * Department Chairperson can be assigned their own department in the settings page.
 *
 * Layout:
 *   SS  — Social Sciences                    → BA History, BA Psychology
 *   LLH — Languages, Literature & Humanities → BA Communication
 *   MNS — Mathematics & Natural Sciences     → BS Biology, BS Mathematics
 *
 * GEC subjects (programId = null) are COPIED into each sub-dept so each chair
 * can generate a complete schedule (major + GEC) for their students.
 * The canonical GEC copies in the CAS parent are kept for deduplication reference.
 *
 * Run: npx tsx --env-file=.env prisma/restore-cas-subdepts.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

// Sub-department definitions and which programs belong to each
const SUB_DEPTS = [
  {
    abbreviation: "SS",
    name: "Social Sciences",
    // Programs matched by abbreviation substring (case-insensitive)
    programMatches: ["BAHist", "BAHistory", "BA History", "BAPsych", "BA Psychology"],
  },
  {
    abbreviation: "LLH",
    name: "Languages, Literature, and Humanities",
    programMatches: ["BAComm", "BA Communication", "BAComm"],
  },
  {
    abbreviation: "MNS",
    name: "Mathematics and Natural Sciences",
    programMatches: ["BSBio", "BS Biology", "BSMath", "BS Mathematics"],
  },
]

async function main() {
  console.log("=== Restoring CAS sub-departments (SS / LLH / MNS) ===\n")

  // 1. Find CAS college and parent department
  const casCollege = await db.college.findFirst({ where: { abbreviation: "CAS" } })
  if (!casCollege) throw new Error("CAS college not found")

  const casParent = await db.department.findFirst({
    where: { collegeId: casCollege.id, abbreviation: "CAS" },
    include: { programs: true, subjects: true },
  })
  if (!casParent) throw new Error("CAS parent department not found")
  console.log(`CAS parent: ${casParent.name} (${casParent.id})`)
  console.log(`  Programs: ${casParent.programs.map(p => p.abbreviation ?? p.name).join(", ") || "(none)"}`)
  console.log(`  Subjects: ${casParent.subjects.length}\n`)

  // Collect all programs currently in CAS (parent + any already-restored sub-depts)
  const allCasPrograms = await db.program.findMany({
    where: { department: { collegeId: casCollege.id } },
  })

  // Collect GEC/GEL subjects from CAS parent (programId = null)
  const gecSubjects = casParent.subjects.filter(s => s.programId === null)
  console.log(`GEC subjects in CAS parent: ${gecSubjects.length}\n`)

  // 2. Process each sub-department
  for (const spec of SUB_DEPTS) {
    console.log(`── ${spec.abbreviation} — ${spec.name} ──`)

    // Upsert the sub-department
    const subDept = await db.department.upsert({
      where: { abbreviation_collegeId: { abbreviation: spec.abbreviation, collegeId: casCollege.id } },
      update: { name: spec.name },
      create: { abbreviation: spec.abbreviation, name: spec.name, collegeId: casCollege.id },
    })
    console.log(`  Department: ${subDept.abbreviation} (${subDept.id})`)

    // Find which programs belong here
    const matchedPrograms = allCasPrograms.filter(p => {
      const haystack = `${p.abbreviation ?? ""} ${p.name}`.toLowerCase()
      return spec.programMatches.some(m => haystack.includes(m.toLowerCase()))
    })

    if (matchedPrograms.length === 0) {
      console.log(`  ⚠  No programs matched for ${spec.abbreviation} — check programMatches`)
    }

    // Move matched programs to this sub-dept
    for (const prog of matchedPrograms) {
      if (prog.departmentId !== subDept.id) {
        await db.program.update({ where: { id: prog.id }, data: { departmentId: subDept.id } })
        console.log(`  ✓ Program moved: ${prog.name} → ${spec.abbreviation}`)
      } else {
        console.log(`  — Already in ${spec.abbreviation}: ${prog.name}`)
      }

      // Move program-specific subjects (those with programId = this program's id)
      const progSubjects = casParent.subjects.filter(s => s.programId === prog.id)
      if (progSubjects.length > 0) {
        await db.subject.updateMany({
          where: { programId: prog.id, departmentId: casParent.id },
          data: { departmentId: subDept.id },
        })
        console.log(`  ✓ Major subjects moved: ${progSubjects.length} for ${prog.name}`)
      }
    }

    // Copy GEC subjects into this sub-dept (so the chair can generate GEC for their students)
    let gecCopied = 0
    for (const gec of gecSubjects) {
      const alreadyExists = await db.subject.findFirst({
        where: { code: gec.code, departmentId: subDept.id },
      })
      if (alreadyExists) continue

      await db.subject.create({
        data: {
          code:         gec.code,
          title:        gec.title,
          units:        gec.units,
          hoursPerWeek: gec.hoursPerWeek,
          type:         gec.type,
          semester:     gec.semester,
          year:         gec.year,
          departmentId: subDept.id,
          programId:    null,
          yearLevelId:  null,
          requiredRoomType: gec.requiredRoomType,
        },
      })
      gecCopied++
    }
    if (gecCopied > 0) console.log(`  ✓ GEC subjects copied: ${gecCopied}`)

    console.log()
  }

  // 3. Summary
  console.log("=== Summary ===")
  for (const spec of SUB_DEPTS) {
    const dept = await db.department.findFirst({
      where: { abbreviation: spec.abbreviation, collegeId: casCollege.id },
      include: { programs: true, _count: { select: { subjects: true } } },
    })
    if (dept) {
      console.log(`${dept.abbreviation}: ${dept.programs.length} programs, ${(dept as any)._count.subjects} subjects`)
    }
  }
  const parentSubjects = await db.subject.count({ where: { departmentId: casParent.id } })
  console.log(`CAS parent: ${parentSubjects} subjects (GEC canonical copies)`)
}

main().catch(console.error).finally(() => db.$disconnect())
