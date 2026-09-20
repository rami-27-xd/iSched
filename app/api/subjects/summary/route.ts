import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { getCurriculumCodes, hasCurriculumMap } from "@/lib/curriculum-map"

// GET /api/subjects/summary?academicYearId=[&departmentId=]
//
// "Subject Summary": for every subject, WHICH programs (grouped by department)
// take it in WHICH semester of the chosen academic year — e.g.
//   1st Semester: GEC05 | CAS — BS Bio, BS Psych | CIT — BSIT
//   2nd Semester: GEC05 | CAS — BA Comm
// Two sources are merged per (subject, semester, program):
//   planned   — the curriculum: the program's curriculum map (lib/curriculum-map.ts)
//               when it has one, else the program's own Subject rows (Subject.semester)
//               plus its department's shared subjects and CAS GEC/GEL by Subject.semester
//               (the same fallback the generator uses for unmapped programs)
//   scheduled — the non-archived schedules of that academic year: sections of the
//               program that actually have a class for the subject, with counts
// Scope: a Department Chairperson sees every department (optional filter); a
// Program Chairperson or Dean sees their own department's programs.
const SUMMARY_ROLES = ["DEAN", "SUPER_ADMIN", "ADMIN"]
const SEMESTERS = ["FIRST", "SECOND", "SUMMER"] as const
type SemType = (typeof SEMESTERS)[number]

interface ProgramCell {
  programId: string
  program: string
  programName: string
  planned: boolean
  scheduled: boolean
  /** Distinct sections with at least one class for this subject. */
  sections: number
  /** Total class rows (sessions) for this subject across those sections. */
  classes: number
  /** Year level(s) the subject sits in for this program (curriculum). */
  years: number[]
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !SUMMARY_ROLES.includes(dbUser.role)) {
      return NextResponse.json(apiError("Only the Dean, Department Chairpersons and Program Chairpersons can view the subject summary"), { status: 403 })
    }
    const { searchParams } = new URL(req.url)
    const isUniversityWide = dbUser.role === "SUPER_ADMIN"
    const ownDeptId = getUserDepartmentId(dbUser)
    const scopeDeptId = isUniversityWide ? (searchParams.get("departmentId") || null) : ownDeptId
    if (!isUniversityWide && !scopeDeptId) {
      return NextResponse.json(apiResponse({ academicYear: null, subjects: [], departments: [] }))
    }

    // Academic year: requested, else current, else the newest.
    let academicYearId = searchParams.get("academicYearId")
    if (!academicYearId) {
      const ay =
        (await db.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } })) ??
        (await db.academicYear.findFirst({ orderBy: { startYear: "desc" }, select: { id: true } }))
      academicYearId = ay?.id ?? null
    }
    const academicYear = academicYearId
      ? await db.academicYear.findUnique({ where: { id: academicYearId }, include: { semesters: { select: { id: true, type: true } } } })
      : null
    if (!academicYear) return NextResponse.json(apiResponse({ academicYear: null, subjects: [], departments: [] }))
    const semTypeById = new Map(academicYear.semesters.map((s) => [s.id, s.type as SemType]))

    const [programs, subjects, entries] = await Promise.all([
      db.program.findMany({
        where: scopeDeptId ? { departmentId: scopeDeptId } : {},
        select: {
          id: true,
          name: true,
          abbreviation: true,
          department: { select: { id: true, name: true, abbreviation: true, college: { select: { abbreviation: true } } } },
          yearLevels: { select: { level: true } },
        },
        orderBy: [{ department: { abbreviation: "asc" } }, { abbreviation: "asc" }],
      }),
      db.subject.findMany({
        select: {
          id: true, code: true, title: true, units: true, type: true, semester: true, year: true,
          departmentId: true, programId: true,
          department: { select: { abbreviation: true } },
        },
      }),
      db.scheduleEntry.findMany({
        where: {
          schedule: { semesterId: { in: [...semTypeById.keys()] }, isArchived: false },
          ...(scopeDeptId ? { section: { yearLevel: { program: { departmentId: scopeDeptId } } } } : {}),
        },
        select: {
          subjectId: true,
          sectionId: true,
          schedule: { select: { semesterId: true } },
          section: { select: { yearLevel: { select: { programId: true } } } },
        },
      }),
    ])

    const subjectByCode = new Map<string, (typeof subjects)[number]>()
    for (const s of subjects) {
      const key = s.code.toLowerCase()
      // Shared codes exist per department; prefer the CAS (GEC-owning) row for
      // display, else the first seen.
      if (!subjectByCode.has(key) || s.department?.abbreviation === "CAS") subjectByCode.set(key, s)
    }
    const subjectById = new Map(subjects.map((s) => [s.id, s]))

    // rows: subjectCode → semester → programId → cell
    const rows = new Map<string, Map<SemType, Map<string, ProgramCell>>>()
    const programById = new Map(programs.map((p) => [p.id, p]))
    function cell(code: string, sem: SemType, programId: string): ProgramCell | null {
      const p = programById.get(programId)
      if (!p) return null
      const key = code.toLowerCase()
      if (!rows.has(key)) rows.set(key, new Map())
      const bySem = rows.get(key)!
      if (!bySem.has(sem)) bySem.set(sem, new Map())
      const byProg = bySem.get(sem)!
      if (!byProg.has(programId)) {
        byProg.set(programId, {
          programId, program: p.abbreviation, programName: p.name,
          planned: false, scheduled: false, sections: 0, classes: 0, years: [],
        })
      }
      return byProg.get(programId)!
    }

    // ── Planned (curriculum) ────────────────────────────────────────────────
    for (const p of programs) {
      const levels = p.yearLevels.length ? [...new Set(p.yearLevels.map((y) => y.level))] : [1, 2, 3, 4]
      if (hasCurriculumMap(p.abbreviation)) {
        for (const sem of ["FIRST", "SECOND"] as const) {
          for (const y of levels) {
            for (const code of getCurriculumCodes(p.abbreviation, y, sem)) {
              const c = cell(code, sem, p.id)
              if (!c) continue
              c.planned = true
              if (!c.years.includes(y)) c.years.push(y)
            }
          }
        }
      } else {
        // Unmapped program: its own subjects, the department's shared subjects,
        // and CAS GEC/GEL — each by the subject's stored semester and year.
        for (const s of subjects) {
          const isGe = /^(GEC|GEL)/i.test(s.code)
          const isOwn = s.programId === p.id
          const isDeptShared = !s.programId && s.departmentId === p.department.id
          if (!(isOwn || isDeptShared || (isGe && s.department?.abbreviation === "CAS"))) continue
          const sem = s.semester as SemType
          const c = cell(s.code, sem, p.id)
          if (!c) continue
          c.planned = true
          if (!c.years.includes(s.year ?? 1)) c.years.push(s.year ?? 1)
        }
      }
    }

    // ── Scheduled (entries this academic year) ──────────────────────────────
    const sectionSets = new Map<string, Set<string>>()
    for (const e of entries) {
      const subj = subjectById.get(e.subjectId)
      const sem = semTypeById.get(e.schedule.semesterId)
      const programId = e.section?.yearLevel?.programId
      if (!subj || !sem || !programId) continue
      const c = cell(subj.code, sem, programId)
      if (!c) continue
      c.scheduled = true
      c.classes += 1
      const key = `${subj.code.toLowerCase()}|${sem}|${programId}`
      if (!sectionSets.has(key)) sectionSets.set(key, new Set())
      sectionSets.get(key)!.add(e.sectionId)
      c.sections = sectionSets.get(key)!.size
    }

    // ── Shape ───────────────────────────────────────────────────────────────
    const departmentsOut = new Map<string, { id: string; abbreviation: string; name: string; college: string }>()
    for (const p of programs) {
      departmentsOut.set(p.department.id, {
        id: p.department.id,
        abbreviation: p.department.abbreviation,
        name: p.department.name,
        college: p.department.college?.abbreviation ?? "",
      })
    }

    const out = [...rows.entries()]
      .map(([key, bySem]) => {
        const subj = subjectByCode.get(key)
        const semesters: Record<string, { department: string; departmentId: string; departmentName: string; programs: ProgramCell[] }[]> = {}
        for (const sem of SEMESTERS) {
          const byProg = bySem.get(sem)
          if (!byProg) continue
          const byDept = new Map<string, { department: string; departmentId: string; departmentName: string; programs: ProgramCell[] }>()
          for (const c of byProg.values()) {
            const p = programById.get(c.programId)!
            const d = p.department
            if (!byDept.has(d.id)) byDept.set(d.id, { department: d.abbreviation, departmentId: d.id, departmentName: d.name, programs: [] })
            byDept.get(d.id)!.programs.push({ ...c, years: [...c.years].sort((a, b) => a - b) })
          }
          semesters[sem] = [...byDept.values()]
            .sort((a, b) => a.department.localeCompare(b.department))
            .map((d) => ({ ...d, programs: d.programs.sort((a, b) => a.program.localeCompare(b.program)) }))
        }
        return {
          code: subj?.code ?? key.toUpperCase(),
          title: subj?.title ?? "",
          units: subj?.units ?? null,
          type: subj?.type ?? null,
          owner: subj?.department?.abbreviation ?? "",
          isGeneralEducation: /^(GEC|GEL)/i.test(subj?.code ?? key),
          isPathfit: /^PATHFIT/i.test(subj?.code ?? key),
          isNstp: /^(NSTP|NST\d)/i.test(subj?.code ?? key),
          semesters,
        }
      })
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

    return NextResponse.json(
      apiResponse({
        academicYear: { id: academicYear.id, label: academicYear.label },
        subjects: out,
        departments: [...departmentsOut.values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
      })
    )
  } catch (error) {
    console.error("GET /api/subjects/summary error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
