/**
 * Placeholder ("sentinel") resources shared by the engine, the API validators,
 * and the client-side pickers. Client-safe — no database imports here.
 *
 *   TBA faculty  — Faculty.employeeId === "TBA". The stand-in a chair picks when
 *                  no real faculty can be assigned yet. Also the default faculty
 *                  on every auto-generated PATHFIT entry.
 *   TBA room     — Room.code === "TBA". Same idea for rooms.
 *   GYM room     — Room.code === "GYM". Every PATHFIT class is held in the GYM.
 *                  It is a shared venue: several sections may hold PATHFIT there
 *                  at the same time, so it is exempt from room double-booking
 *                  checks exactly like TBA.
 *
 * The seed/ensure logic lives in lib/services/sentinels.ts (server-only).
 */
export const TBA_EMPLOYEE_ID = "TBA"
export const TBA_ROOM_CODE = "TBA"
export const GYM_ROOM_CODE = "GYM"
export const GYM_BUILDING_CODE = "GYM"
export const COURT_ROOM_CODE = "COVERED_COURT"
export const FIELD_ROOM_CODE = "FIELD"

/**
 * TBA is retired (2026-10-07): no TBA instructor or TBA room is offered or
 * created any more. The constants stay only so old rows can still be recognised
 * and hidden. Every class has a real, named instructor.
 */
export const PATHFIT_FACULTY_LABEL = ""

/**
 * The ONLY places a PATHFit class may be held, and how many PATHFit classes may
 * run in each at the same time. (A venue is shared, so several sections meet in
 * it at once — up to its limit.)
 */
export const PATHFIT_VENUES: readonly { code: string; name: string; maxConcurrent: number }[] = [
  { code: GYM_ROOM_CODE, name: "Gymnasium", maxConcurrent: 4 },
  { code: COURT_ROOM_CODE, name: "Covered Court", maxConcurrent: 4 },
  { code: FIELD_ROOM_CODE, name: "Field", maxConcurrent: 2 },
]

export const PATHFIT_VENUE_CODES: readonly string[] = PATHFIT_VENUES.map((v) => v.code)

export function isPathfitVenueCode(code: string | null | undefined): boolean {
  return !!code && PATHFIT_VENUE_CODES.includes(code)
}

export function pathfitVenueLimit(code: string | null | undefined): number {
  return PATHFIT_VENUES.find((v) => v.code === code)?.maxConcurrent ?? 1
}

/**
 * Rooms exempt from ordinary one-class-at-a-time room double-booking: the three
 * shared PATHFit venues (their own concurrency limit applies instead) and the
 * legacy TBA room.
 */
export const PLACEHOLDER_ROOM_CODES: readonly string[] = [TBA_ROOM_CODE, ...PATHFIT_VENUE_CODES]

export function isPlaceholderRoomCode(code: string | null | undefined): boolean {
  return !!code && PLACEHOLDER_ROOM_CODES.includes(code)
}

export function isTbaFacultyEmployeeId(employeeId: string | null | undefined): boolean {
  return employeeId === TBA_EMPLOYEE_ID
}

/** PATHFIT (Physical Activity Towards Health and Fitness) subject codes — "PATHFit01", "PATHFIT03", … */
export function isPathfitCode(code: string | null | undefined): boolean {
  return !!code && code.toUpperCase().startsWith("PATHFIT")
}
