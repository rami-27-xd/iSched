/**
 * Migration: Split CIT department into per-track departments.
 *
 * Before: One "CIT" department owns all programs (BSIT-Auto, BSIT-Comp, …, BSInfoTech).
 * After:  Each program track has its own department so Program Chairs can submit independently.
 *
 * Run: npx tsx --env-file=.env prisma/split-cit-departments.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

// GEC/shared-education prefixes — these live in SS/LLH/MNS, NOT in CIT
const GEC_PREFIXES = ["GEC", "GEL", "PATHFIT", "PATHFit", "NST", "NSTP"]
const isGec = (code: string) => GEC_PREFIXES.some(p => code.toUpperCase().startsWith(p.toUpperCase()))

// Mapping of each program track to its new department
const TRACKS = [
  {
    progAbbr:  "BSIT-Auto",
    deptAbbr:  "AIT",
    deptName:  "Industrial Technology - Automotive Technology",
    codePrefix: ["AIT"],
  },
  {
    progAbbr:  "BSIT-Comp",
    deptAbbr:  "CPT",
    deptName:  "Industrial Technology - Computer Technology",
    codePrefix: ["CPT"],
  },
  {
    progAbbr:  "BSIT-Garm",
    deptAbbr:  "AFT",
    deptName:  "Industrial Technology - Garment Technology",
    codePrefix: ["AFT"],
  },
  {
    progAbbr:  "BSIT-Eltx",
    deptAbbr:  "ELX",
    deptName:  "Industrial Technology - Electronics Technology",
    codePrefix: ["ELX"],
  },
  {
    progAbbr:  "BSIT-Elec",
    deptAbbr:  "ELT",
    deptName:  "Industrial Technology - Electrical Technology",
    codePrefix: ["ELT"],
  },
  {
    progAbbr:  "BSIT-Mech",
    deptAbbr:  "MET",
    deptName:  "Industrial Technology - Mechanical Technology",
    codePrefix: ["MET"],
  },
  {
    progAbbr:  "BSIT-Print",
    deptAbbr:  "PMT",
    deptName:  "Industrial Technology - Printing Technology",
    codePrefix: ["PMT"],
  },
  {
    progAbbr:  "BSIT-Food",
    deptAbbr:  "CUL",
    deptName:  "Industrial Technology - Food Technology",
    codePrefix: ["CUL"],
  },
  {
    progAbbr:  "BSInfoTech",
    deptAbbr:  "ITE",
    deptName:  "Information Technology",
    codePrefix: ["ITE"],
  },
]

// All non-GEC subject codes per track from the curriculum map.
// These are used to decide which shared subjects get copied into each dept.
const TRACK_CURRICULUM: Record<string, string[]> = {
  "BSIT-Auto":  ['AIT01','AIT02','AIT03','CHM01a','IND01','AIT04','AIT04L','AIT05','AIT05L','AIT06','AIT06L','IIT01','IIT01L','COM01a','COM01aL','MAT04a','AIT07','AIT07L','AIT08','AIT08L','AIT09','AIT09L','AIT10','AIT10L','PHY01a','PHY01aL','AIT11','AIT11L','AIT12','AIT12L','AIT13','AIT13L','MTM01','AIT14','AIT14L','RES01a','RES01aL','PSY11a','MGT02','IEN11a','AIT15','AIT15L','AIT16','RES02a','RES02aL','FLO01','IEN08a','IEN04a'],
  "BSIT-Comp":  ['CPT02a','CPT02aL','CPT04','CPT04L','CPT05','CPT05L','IIT01','IIT01L','COM01a','COM01aL','CPT01','CPT08a','CPT08aL','ITE15','ITE15L','IND01','IND01L','CPT10','CPT10L','CHM01a','CHM01aL','MAT04a','CPT14','CPT14L','CPT16','CPT16L','PHY01a','PHY01aL','CPT17','CPT17L','CPT18','CPT18L','CPT19','CPT19L','RES01a','RES01aL','PSY11a','FLO01','MTM01','ITE28','ITE28L','CPT11a','CPT11aL','RES02a','RES02aL','ITE13a','IEN08a','IEN04a','MGT02','IEN11a'],
  "BSIT-Garm":  ['AFT01','AFT02','AFT02L','AFT03','AFT03L','COM01a','COM01aL','AFT04','AFT04L','AFT05','AFT05L','IIT01','IIT01L','IND01','IND01L','AFT06','AFT06L','AFT07','AFT07L','AFT08','AFT08L','CHM01a','CHM01aL','AFT09','AFT09L','PHY01a','PHY01aL','MAT04a','AFT10','AFT10L','AFT11','AFT11L','RES01a','RES01aL','PSY11a','MTM01','IEN08a','IEN04a','AFT12','AFT13','AFT14','AFT14L','RES02a','RES02aL','FLO01','MGT02','IEN11a'],
  "BSIT-Eltx":  ['ELX01','ELX02','ELX02L','ELX03','ELX03L','ELX04','ELX04L','IND01','IND01L','COM01a','COM01aL','ELX05','ELX05L','ELX06','ELX06L','ELX07','ELX07L','MAT04a','CHM01a','IIT01','IIT01L','ELX08','ELX08L','ELX09','ELX09L','ELX10','PHY01a','PHY01aL','MTM01','ELX11','ELX11L','ELX12','ELX12L','ELX13','ELX13L','IEN08a','IEN04a','ELT17','ELT17L','RES01a','RES01aL','ELT18','ELT18L','RES02a','RES02aL','FLO01','MGT02','IEN11a'],
  "BSIT-Elec":  ['ELT01','ELT02','ELT02L','ELT03','ELT03L','ELT04','ELT04L','ELT05','ELT06','ELT06L','IND01','IND01L','ELT07','ELT07L','ELT08','ELT08L','ELT09','ELT09L','ELT10','ELT10L','CHM01a','IIT01','IIT01L','COM01a','COM01aL','ELT11','ELT11L','ELT12','ELT12L','ELT13','ELT13L','MAT04a','PHY01a','PHY01aL','ELT14','ELT14L','ELT15','ELT15L','ELT16','ELT16L','MTM01','IEN08a','IEN04a','ELT17','ELT17L','RES01a','RES01aL','ELT18','ELT18L','RES02a','RES02aL','FLO01','MGT02','IEN11a'],
  "BSIT-Mech":  ['MET01','MET02','MET02L','MET03','MET03L','IND01','IND01L','MET04','MET04L','MET05','MET05L','IIT01','IIT01L','COM01a','COM01aL','MET06','MET06L','MET07','MAT04a','PHY01a','PHY01aL','MET08','MET08L','MET09','MET09L','CHM01a','MET10','MET10L','MET11','MET11L','RES01a','RES01aL','MTM01','MGT02','IEN11a','MET12','MET12L','MET13','MET13L','RES02a','RES02aL','FLO01','PSY11a','IEN08a','IEN04a'],
  "BSIT-Print": ['PMT01','PMT02','PMT02L','PMT03','PMT03L','COM01a','COM01aL','PMT04','PMT04L','PMT05','PMT05L','IIT01','IIT01L','IND01','IND01L','PMT06','PMT06L','PHY01a','PHY01aL','MAT04a','PMT07','PMT07L','PMT08','PMT08L','CHM01a','PMT09','PMT09L','PMT10','PMT10L','RES01a','RES01aL','IEN08a','PSY11a','IEN11a','PMT11','PMT11L','PMT12','PMT12L','RES02a','RES02aL','MTM01','IEN04a','MGT02','FLO01'],
  "BSIT-Food":  ['CUL01','CUL02','CUL02L','CUL03','COM01a','COM01aL','CUL04','CUL04L','CUL05','CUL05L','IIT01','IIT01L','IND01','IND01L','CUL06','CUL06L','CUL07','CUL07L','CHM01a','MTM01','CUL08','CUL08L','CUL09','CUL09L','PHY01a','PHY01aL','MAT04a','CUL10','CUL10L','CUL11','CUL12','CUL12L','RES01a','RES01aL','PSY11a','MGT02','IEN11a','CUL13','CUL13L','CUL14','CUL14L','RES02a','RES02aL','FLO01','IEN08a','IEN04a'],
  "BSInfoTech": ['ITE01','ITE01L','ITE02','ITE02L','ITE03','ITE04','ITE05','ITE05L','ITE06','ITE06L','ITE07','ITE07L','ITE08','ITE08L','ITE09','ITE09L','ITE10','ITE10L','ITE11','ITE11L','ITE12','ITE13','ITE14','ITE15','ITE15L','ITE16','ITE16L','ITE17','ITE17L','ITE18','ITE18L','ITE19','ITE19L','ITE20','ITE20L','ITE21','ITE21L','ITE22','ITE23','ITE24','ITE24L','ITE25','ITE25L','ITE26','ITE27','ITE28','ITE28L','ITE29','ITE30','ITE31','ITE31L','ITE32','ITE32L'],
}

async function main() {
  console.log("=== Splitting CIT department into per-track departments ===\n")

  // 1. Find CIT college
  const citCollege = await db.college.findFirst({ where: { abbreviation: "CIT" } })
  if (!citCollege) throw new Error("CIT college not found")
  console.log(`College: ${citCollege.name} (${citCollege.id})`)

  // 2. Find current CIT department (the one holding all programs)
  const citDept = await db.department.findFirst({
    where: { collegeId: citCollege.id },
    include: {
      programs: { include: { yearLevels: { include: { sections: true } } } },
      subjects: true,
      faculty: true,
    },
  })
  if (!citDept) throw new Error("CIT department not found")
  console.log(`Current dept: ${citDept.name} (${citDept.id}) — ${citDept.programs.length} programs, ${citDept.subjects.length} subjects\n`)

  // Build a map of code → subject from the current CIT dept (excluding GEC)
  const citSubjectMap = new Map<string, typeof citDept.subjects[0]>()
  for (const s of citDept.subjects) {
    if (!isGec(s.code)) citSubjectMap.set(s.code.toUpperCase(), s)
  }

  // 3. Process each track
  for (const track of TRACKS) {
    const program = citDept.programs.find(p => p.abbreviation === track.progAbbr)
    if (!program) {
      console.log(`⚠  Program "${track.progAbbr}" not found in CIT dept — skipping`)
      continue
    }

    console.log(`\n── ${track.progAbbr} → ${track.deptAbbr} ─────────────────────`)

    // 3a. Create new department (upsert so re-running is safe)
    const newDept = await db.department.upsert({
      where: { abbreviation_collegeId: { abbreviation: track.deptAbbr, collegeId: citCollege.id } },
      update: { name: track.deptName },
      create: { name: track.deptName, abbreviation: track.deptAbbr, collegeId: citCollege.id },
    })
    console.log(`  ✓ Department: ${track.deptAbbr} (${newDept.id})`)

    // 3b. Move program to new department
    await db.program.update({ where: { id: program.id }, data: { departmentId: newDept.id } })
    console.log(`  ✓ Program moved: ${program.name}`)

    // 3c. Determine which subjects this track needs (from curriculum, excluding GEC)
    const neededCodes = new Set(
      (TRACK_CURRICULUM[track.progAbbr] ?? [])
        .filter(c => !isGec(c))
        .map(c => c.toUpperCase())
    )

    // 3d. For each needed subject: move if track-specific, copy if shared
    let moved = 0, copied = 0, missing = 0
    for (const code of neededCodes) {
      const existing = citSubjectMap.get(code)
      if (!existing) {
        // Already moved to another track dept, or not seeded yet — check if it exists there
        const alreadyExists = await db.subject.findFirst({
          where: { code: { equals: code, mode: "insensitive" }, departmentId: newDept.id }
        })
        if (alreadyExists) continue // already there from a previous run
        console.log(`  ⚠  Subject ${code} not found in original CIT dept (needs seeding)`)
        missing++
        continue
      }

      // Check if this subject is track-specific (code starts with one of this track's prefixes)
      const isTrackSpecific = track.codePrefix.some(p => code.startsWith(p.toUpperCase()))

      // Check if already exists in new dept (from prior run)
      const alreadyInNewDept = await db.subject.findFirst({
        where: { code: { equals: existing.code, mode: "insensitive" }, departmentId: newDept.id }
      })
      if (alreadyInNewDept) continue

      if (isTrackSpecific) {
        // Move: update departmentId in-place
        await db.subject.update({ where: { id: existing.id }, data: { departmentId: newDept.id } })
        citSubjectMap.delete(code) // remove from pool so it isn't re-moved
        moved++
      } else {
        // Shared: copy into this dept (original stays in CIT for other tracks that haven't been processed yet)
        await db.subject.create({
          data: {
            code:          existing.code,
            title:         existing.title,
            units:         existing.units,
            hoursPerWeek:  existing.hoursPerWeek,
            type:          existing.type,
            semester:      existing.semester,
            year:          existing.year,
            departmentId:  newDept.id,
            programId:     null,
            yearLevelId:   null,
            requiredRoomType: existing.requiredRoomType,
          },
        })
        copied++
      }
    }
    console.log(`  ✓ Subjects: ${moved} moved, ${copied} copied, ${missing} missing`)

    // 3e. Move faculty assigned to this program
    const facultyMoved = await db.faculty.updateMany({
      where: { departmentId: citDept.id, programId: program.id },
      data:  { departmentId: newDept.id },
    })
    if (facultyMoved.count > 0) console.log(`  ✓ Faculty moved: ${facultyMoved.count}`)

    // 3f. Move any existing schedules scoped to the old CIT dept (if any entries reference this program's sections)
    // Schedules are dept-scoped; after split they should be created fresh per dept.
    // We only move if there's a schedule directly on CIT dept:
    const citSchedules = await db.schedule.findMany({ where: { departmentId: citDept.id } })
    for (const sched of citSchedules) {
      // Check if any entries in this schedule belong to this program's sections
      const sectionIds = program.yearLevels.flatMap((yl: any) =>
        (yl as any).sections?.map((s: any) => s.id) ?? []
      )
      if (sectionIds.length === 0) continue
      const entryCount = await db.scheduleEntry.count({
        where: { scheduleId: sched.id, sectionId: { in: sectionIds } }
      })
      if (entryCount > 0) {
        await db.schedule.update({ where: { id: sched.id }, data: { departmentId: newDept.id } })
        console.log(`  ✓ Schedule ${sched.id} (${entryCount} entries) reassigned to ${track.deptAbbr}`)
      }
    }
  }

  // 4. Summary
  const remainingSubjects = await db.subject.count({ where: { departmentId: citDept.id } })
  const remainingPrograms = await db.program.count({ where: { departmentId: citDept.id } })
  console.log(`\n=== Done ===`)
  console.log(`Old CIT dept (${citDept.id}): ${remainingPrograms} programs remaining, ${remainingSubjects} subjects remaining`)
  if (remainingPrograms === 0 && remainingSubjects === 0) {
    console.log("Old CIT dept is now empty — safe to delete if desired.")
  } else {
    console.log("Old CIT dept still has data — review before deleting.")
  }
}

main().catch(console.error).finally(() => db.$disconnect())
