import { CTE } from "./cte"
import { CEN } from "./cen"
import { CAM } from "./cam"
import { CABHA } from "./cabha"
import type { CollegeCurriculum } from "./types"

export * from "./types"
export { CTE, CEN, CAM, CABHA }

/** Keyed by College.abbreviation. */
export const COLLEGE_CURRICULA: Record<string, CollegeCurriculum> = { CTE, CEN, CAM, CABHA }

/**
 * GE electives that these curricula use but that did not exist in the CAS
 * department yet. CAS owns every GEC/GEL code (CLAUDE.md), so the seed runner
 * upserts these into CAS (programId null) instead of into the college. The
 * codes were chosen to avoid the existing GEL01 / GEL07 / GEL10 — the source
 * documents number their GE electives inconsistently (see each module header).
 * They are also listed under the Mathematics and Natural Sciences cluster in
 * lib/services/subject-permissions.ts so a Dept Chair can generate them.
 */
export const NEW_CAS_GE_ELECTIVES: { code: string; title: string; units: number; year: number; semester: "FIRST" | "SECOND" }[] = [
  { code: "GEL04", title: "Living in the IT Era",   units: 3, year: 2, semester: "SECOND" },
  { code: "GEL05", title: "The Entrepreneurial Mind", units: 3, year: 2, semester: "SECOND" },
  { code: "GEL08", title: "Human Reproduction",      units: 3, year: 2, semester: "SECOND" },
]
