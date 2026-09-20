import { db } from "../lib/db"
import { getCurriculumCodes, hasCurriculumMap } from "../lib/curriculum-map"

async function main() {
  const cte = await db.department.findFirstOrThrow({ where: { abbreviation: "CTE" } })
  const programs = await db.program.findMany({ where: { departmentId: cte.id }, select: { id: true, abbreviation: true, yearLevels: { select: { level: true, sections: { select: { id: true } } } } } })
  const subjects = await db.subject.findMany({ where: { departmentId: cte.id }, select: { id: true, code: true, title: true, type: true, units: true, hoursPerWeek: true, semester: true, year: true, programId: true } })
  console.log(`CTE subjects: ${subjects.length}; dept-wide: ${subjects.filter(s => !s.programId).length}`)
  const bySem = new Map<string, number>()
  for (const s of subjects) bySem.set(s.semester ?? "null", (bySem.get(s.semester ?? "null") ?? 0) + 1)
  console.log("by Subject.semester:", Object.fromEntries(bySem))

  for (const sem of ["FIRST", "SECOND"] as const) {
    let classes = 0, hours = 0, units = 0
    const perCode = new Map<string, { classes: number; hours: number; units: number; prefix: string; programId: string | null }>()
    for (const p of programs) {
      const sectionYears = new Set(p.yearLevels.filter(y => y.sections.length > 0).map(y => y.level))
      // majors
      for (const s of subjects.filter(x => x.programId === p.id && x.semester === sem)) {
        const n = sectionYears.has(s.year ?? 1) ? 1 : 0
        if (!n) continue
        const e = perCode.get(s.code) ?? { classes: 0, hours: 0, units: 0, prefix: s.code.replace(/[0-9].*$/, ""), programId: s.programId }
        e.classes += n; e.hours += n * s.hoursPerWeek; e.units += n * s.units
        perCode.set(s.code, e)
        classes += n; hours += n * s.hoursPerWeek; units += n * s.units
      }
      // dept-wide via curriculum map
      if (!hasCurriculumMap(p.abbreviation)) continue
      for (const y of sectionYears) {
        for (const code of getCurriculumCodes(p.abbreviation, y, sem)) {
          if (/^(GEC|GEL|PATHFIT|NST)/i.test(code)) continue
          const s = subjects.find(x => x.code.toLowerCase() === code.toLowerCase() && x.programId === null)
          if (!s) continue
          const e = perCode.get(s.code) ?? { classes: 0, hours: 0, units: 0, prefix: s.code.replace(/[0-9].*$/, ""), programId: null }
          e.classes += 1; e.hours += s.hoursPerWeek; e.units += s.units
          perCode.set(s.code, e)
          classes += 1; hours += s.hoursPerWeek; units += s.units
        }
      }
    }
    console.log(`\n=== ${sem}: ${classes} classes, ${hours} hrs/week, ${units} units total; ${perCode.size} distinct codes ===`)
    const byPrefix = new Map<string, { codes: number; classes: number; hours: number; units: number; deptWide: boolean }>()
    for (const [, e] of perCode) {
      const b = byPrefix.get(e.prefix) ?? { codes: 0, classes: 0, hours: 0, units: 0, deptWide: e.programId === null }
      b.codes++; b.classes += e.classes; b.hours += e.hours; b.units += e.units
      byPrefix.set(e.prefix, b)
    }
    for (const [pre, b] of [...byPrefix.entries()].sort((a, b) => b[1].hours - a[1].hours)) {
      console.log(`  ${pre.padEnd(6)} codes:${String(b.codes).padStart(3)} classes:${String(b.classes).padStart(3)} hrs:${String(b.hours).padStart(4)} units:${String(b.units).padStart(4)} ${b.deptWide ? "(dept-wide)" : ""}`)
    }
    const heavy = [...perCode.entries()].filter(([, e]) => e.classes >= 5).sort((a, b) => b[1].hours - a[1].hours)
    console.log("  heavy codes (>=5 sections):", heavy.map(([c, e]) => `${c}×${e.classes}=${e.hours}h`).join(", "))
  }
}
main().catch(console.error).finally(() => db.$disconnect())
