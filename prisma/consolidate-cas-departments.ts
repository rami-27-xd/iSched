/**
 * Migration: Collapse SS / LLH / MNS sub-departments back into the parent CAS department.
 *
 * Before: Three CAS sub-departments (SS, LLH, MNS) each own a slice of GEC subjects.
 *         SUPER_ADMIN users are linked to one of those sub-departments.
 *
 * After:  One "CAS" department owns ALL GEC subjects + all CAS programs.
 *         All CAS SUPER_ADMINs are linked directly to the CAS parent department.
 *
 * Run: npx tsx --env-file=.env prisma/consolidate-cas-departments.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  console.log("=== Consolidating CAS sub-departments into parent CAS ===\n")

  // 1. Find the parent CAS department
  const casDept = await db.department.findFirst({
    where: { abbreviation: "CAS" },
    include: { college: true, subjects: true },
  })
  if (!casDept) throw new Error("Parent CAS department not found")
  console.log(`CAS parent: ${casDept.name} (${casDept.id})`)

  // 2. Find the SS, LLH, MNS sub-departments
  const subDepts = await db.department.findMany({
    where: {
      abbreviation: { in: ["SS", "LLH", "MNS"] },
      collegeId: casDept.collegeId,
    },
    include: { subjects: true },
  })

  if (subDepts.length === 0) {
    console.log("No SS/LLH/MNS sub-departments found — may already be consolidated. Checking users...")
  } else {
    console.log(`Found sub-departments: ${subDepts.map(d => d.abbreviation).join(", ")}`)
  }

  // 3. Move all GEC subjects from sub-depts into CAS parent
  const existingCasCodes = new Set(casDept.subjects.map(s => s.code.toUpperCase()))
  let movedSubjects = 0

  for (const subDept of subDepts) {
    console.log(`\n  Processing ${subDept.abbreviation} (${subDept.subjects.length} subjects)...`)
    for (const s of subDept.subjects) {
      if (existingCasCodes.has(s.code.toUpperCase())) {
        // Already exists in CAS parent — delete the duplicate
        await db.subject.delete({ where: { id: s.id } })
        console.log(`    Removed duplicate: ${s.code}`)
      } else {
        // Move to CAS parent
        await db.subject.update({
          where: { id: s.id },
          data: { departmentId: casDept.id },
        })
        existingCasCodes.add(s.code.toUpperCase())
        movedSubjects++
        console.log(`    Moved: ${s.code} → CAS`)
      }
    }
  }
  console.log(`\n  Total GEC subjects moved to CAS: ${movedSubjects}`)

  // 4. Move any programs that are still in SS/LLH/MNS to CAS parent (safety check)
  for (const subDept of subDepts) {
    const progsMoved = await db.program.updateMany({
      where: { departmentId: subDept.id },
      data: { departmentId: casDept.id },
    })
    if (progsMoved.count > 0) {
      console.log(`  Moved ${progsMoved.count} programs from ${subDept.abbreviation} to CAS`)
    }
  }

  // 5. Update all SUPER_ADMIN users linked to SS/LLH/MNS → point to CAS parent
  const subDeptIds = subDepts.map(d => d.id)
  const updatedUsers = await db.user.updateMany({
    where: { departmentId: { in: subDeptIds } },
    data: { departmentId: casDept.id },
  })
  console.log(`\n  SUPER_ADMIN users re-linked to CAS parent: ${updatedUsers.count}`)

  // Also update users whose department is resolved via DepartmentChair relation
  for (const subDept of subDepts) {
    const chair = await db.departmentChair.findUnique({
      where: { departmentId: subDept.id },
      include: { user: true },
    })
    if (chair) {
      // Set User.departmentId directly so getUserDepartmentId() returns CAS parent
      // (User.departmentId takes precedence over departmentChair.departmentId)
      await db.user.update({
        where: { id: chair.userId },
        data: { departmentId: casDept.id },
      })
      console.log(`  Linked chair ${chair.user.firstName} ${chair.user.lastName} → CAS parent`)
    }
  }

  // 6. Delete DepartmentChair records tied to sub-depts (now orphaned)
  for (const subDept of subDepts) {
    await db.departmentChair.deleteMany({ where: { departmentId: subDept.id } })
  }

  // 7. Move any schedules from sub-depts to CAS parent
  const movedSchedules = await db.schedule.updateMany({
    where: { departmentId: { in: subDeptIds } },
    data: { departmentId: casDept.id },
  })
  if (movedSchedules.count > 0) {
    console.log(`  Moved ${movedSchedules.count} schedules to CAS parent`)
  }

  // 8. Delete the now-empty sub-departments
  for (const subDept of subDepts) {
    const remaining = await db.subject.count({ where: { departmentId: subDept.id } })
    const remainingProgs = await db.program.count({ where: { departmentId: subDept.id } })
    if (remaining === 0 && remainingProgs === 0) {
      await db.department.delete({ where: { id: subDept.id } })
      console.log(`  Deleted sub-department: ${subDept.abbreviation}`)
    } else {
      console.log(`  ⚠  ${subDept.abbreviation} still has ${remaining} subjects / ${remainingProgs} programs — NOT deleted`)
    }
  }

  // 9. Summary
  const finalSubjectCount = await db.subject.count({ where: { departmentId: casDept.id } })
  const finalProgCount = await db.program.count({ where: { departmentId: casDept.id } })
  console.log(`\n=== Done ===`)
  console.log(`CAS parent now has: ${finalProgCount} programs, ${finalSubjectCount} subjects`)
}

main().catch(console.error).finally(() => db.$disconnect())
