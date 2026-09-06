/**
 * Removes schedule entries that violate curriculum alignment — stale rows from
 * generations that ran before program/semester scoping was enforced:
 *
 *   A. Cross-program major     — subject belongs to program X, scheduled into
 *                                 program Y's section (e.g. FLS02 → BAComm 2-A)
 *   B. Wrong-semester major    — 2nd-sem subject inside a 1st-sem schedule
 *   C. Wrong-year major        — subject.year ≠ section's year level
 *   D. GEC misplacement        — per the curriculum map, the section's program
 *                                 does not take this GEC code in this year+semester
 *
 * NSTP/PATHFit are skipped (manually scheduled — chair's judgment).
 * Unassigned-queue rows get the same treatment.
 *
 * Run: npx tsx --env-file=.env prisma/cleanup-misaligned-entries.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { getCurriculumCodes, hasCurriculumMap } from "../lib/curriculum-map"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

const MANUAL_PREFIXES = ["NSTP", "NST", "PATHFIT"]

async function main() {
  const schedules = await db.schedule.findMany({
    where: { isArchived: false },
    include: {
      department: { select: { abbreviation: true } },
      semester: { select: { type: true } },
    },
  })

  let totalDeleted = 0

  for (const sched of schedules) {
    const semType = sched.semester?.type as "FIRST" | "SECOND" | undefined
    if (!semType) continue

    const entries = await db.scheduleEntry.findMany({
      where: { scheduleId: sched.id },
      include: {
        subject: { select: { code: true, programId: true, semester: true, year: true } },
        section: {
          select: {
            name: true,
            yearLevel: { select: { level: true, programId: true, program: { select: { abbreviation: true } } } },
          },
        },
      },
    })

    const toDelete: { id: string; why: string; label: string }[] = []

    for (const e of entries) {
      const code = (e.subject?.code ?? "").toUpperCase()
      if (MANUAL_PREFIXES.some(p => code.startsWith(p))) continue

      const secYear = e.section?.yearLevel?.level
      const secProgramId = e.section?.yearLevel?.programId
      const progAbbr = e.section?.yearLevel?.program?.abbreviation
      const label = `${e.subject?.code} → ${e.section?.name}`

      if (e.subject?.programId) {
        // Major subject checks
        if (secProgramId && e.subject.programId !== secProgramId) {
          toDelete.push({ id: e.id, why: "cross-program", label })
        } else if (e.subject.semester !== semType) {
          toDelete.push({ id: e.id, why: "wrong-semester", label })
        } else if (secYear && e.subject.year !== secYear) {
          toDelete.push({ id: e.id, why: "wrong-year", label })
        }
      } else if (progAbbr && secYear && hasCurriculumMap(progAbbr)) {
        // GEC/shared subject — must appear in the section program's curriculum
        // for this exact year + semester
        const codes = getCurriculumCodes(progAbbr, secYear, semType)
        if (!codes.some(c => c.toUpperCase() === code)) {
          toDelete.push({ id: e.id, why: "gec-misplaced", label })
        }
      }
    }

    // Same checks for the unassigned queue
    const unassigned = await db.unassignedEntry.findMany({
      where: { scheduleId: sched.id },
      include: {
        subject: { select: { code: true, programId: true, semester: true, year: true } },
        section: {
          select: {
            name: true,
            yearLevel: { select: { level: true, programId: true, program: { select: { abbreviation: true } } } },
          },
        },
      },
    })
    const unassignedToDelete: string[] = []
    for (const u of unassigned) {
      const code = (u.subject?.code ?? "").toUpperCase()
      if (MANUAL_PREFIXES.some(p => code.startsWith(p))) continue
      const secYear = u.section?.yearLevel?.level
      const secProgramId = u.section?.yearLevel?.programId
      const progAbbr = u.section?.yearLevel?.program?.abbreviation
      if (u.subject?.programId) {
        if (
          (secProgramId && u.subject.programId !== secProgramId) ||
          u.subject.semester !== semType ||
          (secYear && u.subject.year !== secYear)
        ) unassignedToDelete.push(u.id)
      } else if (progAbbr && secYear && hasCurriculumMap(progAbbr)) {
        const codes = getCurriculumCodes(progAbbr, secYear, semType)
        if (!codes.some(c => c.toUpperCase() === code)) unassignedToDelete.push(u.id)
      }
    }

    if (toDelete.length === 0 && unassignedToDelete.length === 0) {
      console.log(`Schedule ${sched.id.slice(-6)} (${sched.department?.abbreviation}, ${semType}): aligned ✓`)
      continue
    }

    console.log(`\nSchedule ${sched.id.slice(-6)} (${sched.department?.abbreviation}, ${semType}): removing ${toDelete.length} entries + ${unassignedToDelete.length} unassigned rows`)
    const byReason = new Map<string, string[]>()
    for (const d of toDelete) {
      if (!byReason.has(d.why)) byReason.set(d.why, [])
      byReason.get(d.why)!.push(d.label)
    }
    for (const [why, labels] of byReason) {
      const sample = labels.slice(0, 4).join(", ")
      console.log(`  ${why}: ${labels.length}  (${sample}${labels.length > 4 ? ", ..." : ""})`)
    }

    await db.scheduleEntry.deleteMany({ where: { id: { in: toDelete.map(d => d.id) } } })
    if (unassignedToDelete.length > 0) {
      await db.unassignedEntry.deleteMany({ where: { id: { in: unassignedToDelete } } })
    }
    totalDeleted += toDelete.length
  }

  console.log(`\nDone — ${totalDeleted} misaligned entries removed.`)
}

main().catch(console.error).finally(() => db.$disconnect())
