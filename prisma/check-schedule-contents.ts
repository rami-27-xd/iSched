/**
 * Shows each schedule's owning department and a breakdown of its entries
 * by the section's program — reveals cross-department contamination.
 *
 * Run: npx tsx --env-file=.env prisma/check-schedule-contents.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const schedules = await db.schedule.findMany({
    where: { isArchived: false },
    include: {
      department: { include: { college: true } },
      semester: { include: { academicYear: true } },
      entries: {
        include: {
          section: { include: { yearLevel: { include: { program: { include: { department: { include: { college: true } } } } } } } },
          subject: { select: { code: true } },
        },
      },
    },
  })

  for (const s of schedules) {
    console.log(`\n─── Schedule ${s.id.slice(-6)} ── status=${s.status} ── dept=${s.department?.abbreviation ?? "null"} (${s.department?.college?.abbreviation ?? "?"}) ── ${s.entries.length} entries`)
    console.log(`    semester=${s.semester?.type} ${s.semester?.academicYear?.label ?? ""}  createdBy=${s.createdBy}`)

    const byProgram = new Map<string, { count: number; college: string; sample: string[] }>()
    for (const e of s.entries) {
      const prog = e.section?.yearLevel?.program
      const key = prog?.abbreviation ?? "?"
      const college = prog?.department?.college?.abbreviation ?? "?"
      if (!byProgram.has(key)) byProgram.set(key, { count: 0, college, sample: [] })
      const rec = byProgram.get(key)!
      rec.count++
      if (rec.sample.length < 3) rec.sample.push(e.subject?.code ?? "?")
    }

    for (const [prog, rec] of [...byProgram.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`    ${prog.padEnd(12)} [${rec.college}]  ${String(rec.count).padStart(3)} entries  e.g. ${rec.sample.join(", ")}`)
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect())
