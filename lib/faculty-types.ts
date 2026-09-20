/**
 * Faculty employment types and the weekly unit cap each one carries.
 * Client-safe — shared by the Faculty / Faculty Availability forms, the
 * faculty API (which derives Faculty.maxUnitsPerWeek from the type on every
 * write), the engine and the capacity validator.
 *
 *   REGULAR — a regular (plantilla) faculty member: at most 21 units a week.
 *   COSI    — Contract of Service Instructor: at most 40 units a week.
 */
export type FacultyType = "REGULAR" | "COSI"

export const FACULTY_TYPES: FacultyType[] = ["REGULAR", "COSI"]

export const FACULTY_TYPE_LABELS: Record<FacultyType, string> = {
  REGULAR: "Regular",
  COSI: "COSI",
}

export const FACULTY_TYPE_DESCRIPTIONS: Record<FacultyType, string> = {
  REGULAR: "Regular faculty — up to 21 units a week",
  COSI: "Contract of Service Instructor — up to 40 units a week",
}

export const MAX_UNITS_BY_TYPE: Record<FacultyType, number> = {
  REGULAR: 21,
  COSI: 40,
}

/** Default weekly contact-hour cap suggested for each type (editable per faculty). */
export const DEFAULT_HOURS_BY_TYPE: Record<FacultyType, number> = {
  REGULAR: 30,
  COSI: 40,
}

/** The highest unit cap any type allows — the engine-wide ceiling. */
export const MAX_UNITS_ANY_TYPE = Math.max(...Object.values(MAX_UNITS_BY_TYPE))

export function isFacultyType(v: unknown): v is FacultyType {
  return v === "REGULAR" || v === "COSI"
}

export function maxUnitsForType(type: string | null | undefined): number {
  return isFacultyType(type) ? MAX_UNITS_BY_TYPE[type] : MAX_UNITS_BY_TYPE.REGULAR
}

export function formatFacultyType(type: string | null | undefined): string {
  return isFacultyType(type) ? FACULTY_TYPE_LABELS[type] : FACULTY_TYPE_LABELS.REGULAR
}
