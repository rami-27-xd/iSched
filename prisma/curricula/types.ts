/**
 * Shared shapes + helpers for the per-college curriculum data modules
 * (prisma/curricula/*.ts). Pure data — no database imports — so the seed runner
 * (prisma/seed-curriculum-colleges.ts) and one-off generators can both use it.
 */

export type Sem = "FIRST" | "SECOND" | "SUMMER"

/** One line of a curriculum table: lecture + laboratory units as printed. */
export interface Row {
  code: string
  title: string
  lec: number
  lab: number
}

export interface Block {
  year: number
  sem: Sem
  rows: Row[]
}

export interface ProgramCurriculum {
  /** Must equal Program.abbreviation in the DB. */
  abbreviation: string
  name: string
  blocks: Block[]
}

export interface CollegeCurriculum {
  /** College.abbreviation */
  college: string
  /** Department.abbreviation that owns the subjects (one department per college). */
  department: string
  programs: ProgramCurriculum[]
}

export const r = (code: string, title: string, lec: number, lab = 0): Row => ({ code, title, lec, lab })
export const block = (year: number, sem: Sem, rows: Row[]): Block => ({ year, sem, rows })

/**
 * GEC / GEL / PATHFit / NSTP are owned by CAS (see CLAUDE.md) and are never
 * created inside another college's department — the curriculum map is what
 * ties them to a program's sections.
 */
export function isGeCode(code: string): boolean {
  const c = code.toUpperCase()
  return c.startsWith("GEC") || c.startsWith("GEL") || c.startsWith("PATHFIT") || c.startsWith("NSTP") || c.startsWith("NST0")
}

/**
 * The curriculum documents spell the shared CAS codes inconsistently
 * (PATHFIT02 / PATHFit02, NST01 / NSTP01 / NSTP1 / HIST01 …). Normalise them to
 * the codes that actually exist in the CAS department so the curriculum map
 * matches the DB rows exactly.
 */
export function canonicalCode(code: string): string {
  const c = code.trim()
  const pf = /^PATHFIT0?(\d)$/i.exec(c)
  if (pf) return `PATHFit0${pf[1]}`
  const nstp = /^(?:NSTP?|HIST)0?(\d)$/i.exec(c)
  if (nstp) return `NSTP${nstp[1]}`
  return c
}

export interface SubjectSpec {
  code: string
  title: string
  units: number
  type: "LECTURE" | "LABORATORY"
}

/**
 * Split a printed row into the subject records this codebase stores:
 *   lec>0, lab>0  → CODE (LECTURE, lec units) + CODEL ("<title> Laboratory", lab units)
 *   lec>0, lab=0  → CODE (LECTURE)
 *   lec=0, lab>0  → CODE (LABORATORY) — the code is kept as printed (COM01, PHY03L …)
 */
export function expandRow(row: Row): SubjectSpec[] {
  const code = canonicalCode(row.code)
  const out: SubjectSpec[] = []
  if (row.lec > 0) out.push({ code, title: row.title, units: row.lec, type: "LECTURE" })
  if (row.lab > 0) {
    if (row.lec > 0) {
      out.push({ code: `${code}L`, title: `${row.title} Laboratory`, units: row.lab, type: "LABORATORY" })
    } else {
      out.push({ code, title: row.title, units: row.lab, type: "LABORATORY" })
    }
  }
  return out
}
