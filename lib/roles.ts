/**
 * Role vocabulary shared by the server (API routes, lib/auth.ts) and the client
 * (sidebar, guards, pages). Client-safe — no database imports.
 *
 *   DEAN         — one per department. Approves the accounts of their own
 *                  department, reads System Logs (department activity, every
 *                  department schedule, room occupancy in their buildings).
 *                  Read-only everywhere else.
 *   SUPER_ADMIN  — Department Chairperson (CAS). GEC/GEL + CAS majors, and the
 *                  approve / reject step of the schedule workflow.
 *   ADMIN        — Program Chairperson. Their own program's major subjects.
 *   PATHFIT      — the single PATHFit Director account. Generates and edits
 *                  PATHFit entries in every college's schedule.
 *   NSTP         — the single NSTP Director account. Edits NSTP entries
 *                  (never auto-generated) in every college's schedule.
 *   FACULTY      — record-only stub; cannot sign in.
 */
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "FACULTY" | "DEAN" | "PATHFIT" | "NSTP"

export const ROLE_LABELS: Record<UserRole, string> = {
  DEAN: "Dean",
  SUPER_ADMIN: "Department Chairperson",
  ADMIN: "Program Chairperson",
  PATHFIT: "PATHFit Director",
  NSTP: "NSTP Director",
  FACULTY: "Faculty",
}

export function formatRole(role: string | null | undefined): string {
  return (role && (ROLE_LABELS as Record<string, string>)[role]) || role || ""
}

/** Accounts that actually sign in (FACULTY rows are record-only stubs). */
export const LOGIN_ROLES: UserRole[] = ["DEAN", "SUPER_ADMIN", "ADMIN", "PATHFIT", "NSTP"]

/** Roles a person may pick for themselves on the sign-up form. */
export const SELF_REGISTER_ROLES: UserRole[] = ["DEAN", "SUPER_ADMIN", "ADMIN", "PATHFIT", "NSTP"]

/**
 * Exactly ONE account exists system-wide for each of these roles, and it is
 * auto-approved on creation — there is nobody else in the unit to approve it.
 */
export const SINGLETON_ROLES: UserRole[] = ["PATHFIT", "NSTP"]

/** The two GE-unit coordinator roles. */
export function isGeUnitRole(role: string | null | undefined): role is "PATHFIT" | "NSTP" {
  return role === "PATHFIT" || role === "NSTP"
}

export function isSingletonRole(role: string | null | undefined): role is "PATHFIT" | "NSTP" {
  return role === "PATHFIT" || role === "NSTP"
}

/** Roles whose work spans every college — they may switch the college filter. */
export function isUniversityWideRole(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "PATHFIT" || role === "NSTP"
}

/** Roles that may open the scheduling pages at all (Dean = read-only). */
export const SCHEDULING_VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "DEAN", "PATHFIT", "NSTP"]
/** Roles that may write schedule entries (subject ownership still applies). */
export const SCHEDULING_EDIT_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PATHFIT", "NSTP"]
/** Roles that may read the Faculty / Buildings / Departments data pages. */
export const DATA_VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "DEAN"]
/** Roles that may write faculty / rooms / subjects. */
export const DATA_EDIT_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"]

export function canViewScheduling(role: string | null | undefined): boolean {
  return SCHEDULING_VIEW_ROLES.includes(role as UserRole)
}
export function canEditScheduling(role: string | null | undefined): boolean {
  return SCHEDULING_EDIT_ROLES.includes(role as UserRole)
}
export function isReadOnlyRole(role: string | null | undefined): boolean {
  return role === "DEAN"
}

/** Subject codes a GE-unit coordinator owns. */
export function isNstpCode(code: string | null | undefined): boolean {
  const c = (code ?? "").toUpperCase()
  return c.startsWith("NSTP") || /^NST\d/.test(c)
}
export function isPathfitSubjectCode(code: string | null | undefined): boolean {
  return (code ?? "").toUpperCase().startsWith("PATHFIT")
}
export function geUnitOwnsCode(role: string | null | undefined, code: string | null | undefined): boolean {
  if (role === "PATHFIT") return isPathfitSubjectCode(code)
  if (role === "NSTP") return isNstpCode(code)
  return false
}
