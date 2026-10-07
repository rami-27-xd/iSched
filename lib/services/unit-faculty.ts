import { db } from "@/lib/db"
import { specializationsCoverSubject } from "@/lib/specialization-match"

/**
 * PATHFit Director / NSTP Director faculty.
 *
 * Both directors live in the CAS department, which also holds every GEC/GEL
 * instructor, so department scope alone cannot tell "my" faculty from the
 * Department Chairpersons'. A Director's faculty are the CAS instructors tagged
 * for that Director's own subjects (PATHFit01–04 / NSTP01–02) — the Faculty page
 * therefore requires at least one such tag when a Director adds someone.
 */
export type UnitRole = "PATHFIT" | "NSTP"

export function isUnitRole(role: string | null | undefined): role is UnitRole {
  return role === "PATHFIT" || role === "NSTP"
}

/** Subject-code prefix owned by this Director. */
export function unitCodePrefix(role: UnitRole): string {
  return role === "PATHFIT" ? "PATHFIT" : "NST"
}

export async function getUnitSubjects(role: UnitRole): Promise<{ title: string; code: string }[]> {
  return db.subject.findMany({
    where: { code: { startsWith: unitCodePrefix(role), mode: "insensitive" } },
    select: { title: true, code: true },
  })
}

/** True when any of the faculty's specializations covers one of the Director's subjects. */
export function facultyBelongsToUnit(
  specializations: string[] | null | undefined,
  unitSubjects: { title: string; code: string }[]
): boolean {
  const specs = specializations ?? []
  if (specs.length === 0) return false
  return unitSubjects.some((s) => specializationsCoverSubject(specs, s.title, s.code))
}
