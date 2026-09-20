// Re-derives every faculty member's weekly unit cap from their employment type
// (Regular 21 / COSI 40 — lib/faculty-types.ts) and lifts a COSI's hours cap to
// at least the type default. Idempotent; run after `prisma db push` added
// Faculty.employmentType:  npx tsx --env-file=.env prisma/seed-faculty-type-caps.ts
import { db } from "../lib/db"
import { MAX_UNITS_BY_TYPE, DEFAULT_HOURS_BY_TYPE } from "../lib/faculty-types"

async function main() {
  const rows = await db.faculty.findMany({ select: { id: true, employmentType: true, maxUnitsPerWeek: true, maxHoursPerWeek: true } })
  let unitsFixed = 0
  let hoursLifted = 0
  for (const f of rows) {
    const units = MAX_UNITS_BY_TYPE[f.employmentType]
    const hours = Math.max(f.maxHoursPerWeek, DEFAULT_HOURS_BY_TYPE[f.employmentType])
    if (units === f.maxUnitsPerWeek && hours === f.maxHoursPerWeek) continue
    await db.faculty.update({ where: { id: f.id }, data: { maxUnitsPerWeek: units, maxHoursPerWeek: hours } })
    if (units !== f.maxUnitsPerWeek) unitsFixed++
    if (hours !== f.maxHoursPerWeek) hoursLifted++
  }
  console.log(`${rows.length} faculty checked — ${unitsFixed} unit cap(s) re-derived, ${hoursLifted} hours cap(s) lifted`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
