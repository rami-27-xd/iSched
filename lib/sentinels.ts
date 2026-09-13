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

/** Free-text faculty label stored on auto-generated PATHFIT entries. */
export const PATHFIT_FACULTY_LABEL = "TBA"

/** Rooms that are placeholders rather than real, single-occupancy rooms. */
export const PLACEHOLDER_ROOM_CODES: readonly string[] = [TBA_ROOM_CODE, GYM_ROOM_CODE]

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
