/**
 * Room code standard (client-safe). One format for every room:
 *
 *     <BUILDING CODE>-<ROOM>        e.g.  HPB-301   MDP-COMPLAB   ICT-2A
 *
 * - The prefix is ALWAYS the room's building code, so a code says where the room is.
 * - <ROOM> is the room number as on the campus map (the floor digit first: 301 is
 *   on the 3rd floor), or — for a named room — an upper-case abbreviation of its
 *   name with no spaces (CPTLEC, ELEXLAB, KITCHEN).
 * - Upper-case letters and digits only, one hyphen. No spaces, dots or slashes.
 *
 * The shared PATHFit venues (GYM, COVERED_COURT, FIELD) and the retired TBA room
 * keep their fixed codes and are exempt.
 */
import { GYM_ROOM_CODE, COURT_ROOM_CODE, FIELD_ROOM_CODE, TBA_ROOM_CODE } from "@/lib/sentinels"

const EXEMPT_CODES: readonly string[] = [GYM_ROOM_CODE, COURT_ROOM_CODE, FIELD_ROOM_CODE, TBA_ROOM_CODE]

export const ROOM_CODE_HINT = "Building code, a hyphen, then the room number or abbreviation — e.g. HPB-301"

/** Upper-case, drop every character that is not a letter or digit. */
function cleanPart(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export function isExemptRoomCode(code: string | null | undefined): boolean {
  return !!code && EXEMPT_CODES.includes(code)
}

/**
 * Turns whatever was typed into the standard code for that building:
 * "301", "hp 301", "HPB 301", "hpb-301" all become "HPB-301" in building HPB.
 * Returns "" when nothing usable was typed.
 */
export function formatRoomCode(buildingCode: string | null | undefined, input: string): string {
  const prefix = cleanPart(buildingCode ?? "")
  const typed = input.trim()
  if (!typed) return ""
  if (isExemptRoomCode(typed.toUpperCase())) return typed.toUpperCase()

  let rest = cleanPart(typed)
  // Typed with the building code already ("HPB-301" / "HPB 301" / "HPB301")?
  if (prefix && rest.startsWith(prefix) && rest.length > prefix.length) rest = rest.slice(prefix.length)
  if (!rest) return ""
  return prefix ? `${prefix}-${rest}` : rest
}

/** null when the code follows the standard for that building, otherwise the problem in plain words. */
export function roomCodeProblem(buildingCode: string | null | undefined, code: string): string | null {
  if (isExemptRoomCode(code)) return null
  const prefix = cleanPart(buildingCode ?? "")
  if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(code)) {
    return "Room code must be the building code, a hyphen, then the room (letters and digits only, no spaces) — e.g. HPB-301"
  }
  if (prefix && !code.startsWith(`${prefix}-`)) {
    return `Room code must start with its building code (${prefix}-…)`
  }
  return null
}
