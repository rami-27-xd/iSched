/**
 * Revert: Collapse per-track CIT departments (AIT, CPT, AFT, …) back into
 * the original single CIT department.
 *
 * Run: npx tsx --env-file=.env prisma/revert-cit-split.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

const TRACK_ABBRS = ["AIT", "CPT", "AFT", "ELX", "ELT", "MET", "PMT", "CUL", "ITE"]

async function main() {
  console.log("=== Reverting CIT per-track split → single CIT department ===\n")

  // 1. Find CIT college
  const citCollege = await db.college.findFirst({ where: { abbreviation: "CIT" } })
  if (!citCollege) throw new Error("CIT college not found")

  // 2. Find the original CIT department (any dept under CIT that isn't a per-track dept)
  const citDept = await db.department.findFirst({
    where: {
      collegeId: citCollege.id,
      abbreviation: { notIn: TRACK_ABBRS },
    },
    include: { subjects: true },
  })
  if (!citDept) throw new Error("Original CIT department not found")
  console.log(`Original CIT dept: "${citDept.name}" (${citDept.abbreviation}) — ${citDept.subjects.length} subjects\n`)

  // Build a set of codes already in the original CIT dept (used to detect shared-copy subjects)
  const citCodesLower = new Set(citDept.subjects.map(s => s.code.toLowerCase()))

  // 3. Find all per-track departments to revert
  const trackDepts = await db.department.findMany({
    where: { collegeId: citCollege.id, abbreviation: { in: TRACK_ABBRS } },
    include: { subjects: true, programs: true, faculty: true },
  })
  if (trackDepts.length === 0) {
    console.log("No per-track departments found — nothing to revert.")
    return
  }
  console.log(`Found ${trackDepts.length} per-track dept(s): ${trackDepts.map(d => d.abbreviation).join(", ")}\n`)

  for (const trackDept of trackDepts) {
    console.log(`── ${trackDept.abbreviation} (${trackDept.subjects.length} subjects, ${trackDept.programs.length} programs) ──`)

    // 3a. Handle subjects
    for (const s of trackDept.subjects) {
      const codeLower = s.code.toLowerCase()
      if (citCodesLower.has(codeLower)) {
        // This is a shared-subject copy that was duplicated by the split.
        // The original already lives in the CIT dept — delete this copy.
        // Clean up any schedule entries pointing to this copy first.
        await db.scheduleEntry.deleteMany({ where: { subjectId: s.id } })
        await db.unassignedEntry.deleteMany({ where: { subjectId: s.id } })
        await db.subject.delete({ where: { id: s.id } })
        console.log(`  Deleted shared copy: ${s.code}`)
      } else {
        // Track-specific subject — move back to original CIT dept
        await db.subject.update({ where: { id: s.id }, data: { departmentId: citDept.id } })
        citCodesLower.add(codeLower)
        console.log(`  Moved back: ${s.code} → CIT`)
      }
    }

    // 3b. Move programs back
    if (trackDept.programs.length > 0) {
      await db.program.updateMany({
        where: { departmentId: trackDept.id },
        data: { departmentId: citDept.id },
      })
      console.log(`  Programs moved back: ${trackDept.programs.map(p => p.abbreviation).join(", ")}`)
    }

    // 3c. Move faculty back
    const facultyMoved = await db.faculty.updateMany({
      where: { departmentId: trackDept.id },
      data: { departmentId: citDept.id },
    })
    if (facultyMoved.count > 0) console.log(`  Faculty moved back: ${facultyMoved.count}`)

    // 3d. Move schedules back
    const schedulesMoved = await db.schedule.updateMany({
      where: { departmentId: trackDept.id },
      data: { departmentId: citDept.id },
    })
    if (schedulesMoved.count > 0) console.log(`  Schedules moved back: ${schedulesMoved.count}`)

    // 3e. Move any ADMIN users linked to this per-track dept back to CIT
    const usersMoved = await db.user.updateMany({
      where: { departmentId: trackDept.id },
      data: { departmentId: citDept.id },
    })
    if (usersMoved.count > 0) console.log(`  Users moved back: ${usersMoved.count}`)

    // 3f. Remove any building restrictions tied to this per-track dept
    await db.departmentBuilding.deleteMany({ where: { departmentId: trackDept.id } })

    // 3g. Delete the per-track department (verify empty first)
    const leftoverSubjects = await db.subject.count({ where: { departmentId: trackDept.id } })
    const leftoverPrograms = await db.program.count({ where: { departmentId: trackDept.id } })
    if (leftoverSubjects === 0 && leftoverPrograms === 0) {
      await db.department.delete({ where: { id: trackDept.id } })
      console.log(`  ✓ Deleted department ${trackDept.abbreviation}`)
    } else {
      console.log(`  ⚠  ${trackDept.abbreviation} still has ${leftoverSubjects} subjects / ${leftoverPrograms} programs — NOT deleted`)
    }
  }

  // 4. Summary
  const finalSubjects = await db.subject.count({ where: { departmentId: citDept.id } })
  const finalPrograms = await db.program.count({ where: { departmentId: citDept.id } })
  const finalFaculty  = await db.faculty.count({ where: { departmentId: citDept.id } })
  console.log(`\n=== Done ===`)
  console.log(`CIT dept now has: ${finalPrograms} programs, ${finalSubjects} subjects, ${finalFaculty} faculty`)
}

main().catch(console.error).finally(() => db.$disconnect())
