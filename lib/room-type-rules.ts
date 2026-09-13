/**
 * Room-type requirements per subject — the single source of truth for the
 * engine (via the generate route), the manual-entry validator, and the Add/Edit
 * Entry room pickers, so every path agrees on which rooms a subject may use.
 *
 * Rule order:
 *   1. An explicit Subject.requiredRoomType (set on the Subject form) always wins.
 *   2. LABORATORY subjects that are computing-based (Computer Programming, Data
 *      Structures, Database, Web, Networking, CAD …) must use a COMPUTER_LAB.
 *   3. Every other LABORATORY subject needs a lab-capable room: LABORATORY or
 *      LECTURE_LAB (the combined rooms).
 *   4. LECTURE subjects need a lecture-capable room: LECTURE_ROOM or LECTURE_LAB.
 *
 * Client-safe — no database imports.
 */

export type RoomTypeValue = "LECTURE_ROOM" | "LABORATORY" | "COMPUTER_LAB" | "LECTURE_LAB"

export interface RoomTypeSubject {
  code?: string | null
  title?: string | null
  type?: "LECTURE" | "LABORATORY" | string | null
  requiredRoomType?: string[] | null
}

export const ROOM_TYPE_LABELS: Record<RoomTypeValue, string> = {
  LECTURE_ROOM: "Lecture Room",
  LABORATORY: "Laboratory",
  COMPUTER_LAB: "Computer Laboratory",
  LECTURE_LAB: "Lecture + Lab Room",
}

// Subject-code prefixes whose laboratory sessions are always held on computers.
const COMPUTER_LAB_CODE_PREFIXES = ["ITE", "COM", "IIT"]

// Title fragments (lower-case) that mark a lab as computer-based.
const COMPUTER_LAB_TITLE_KEYWORDS = [
  "programming",
  "computing",
  "software",
  "database",
  "data structure",
  "data mining",
  "analytics",
  "web ",
  "web-",
  "front-end",
  "operating system",
  "information technology",
  "information management",
  "object-oriented",
  "computer-aided",
  "computer aided",
  " cad",
  "cad ",
  "digital modeling",
  "digital print",
  "digital photography",
  "image processing",
  "rendering",
  "multimedia",
  "visual graphic",
  "graphic design",
  "networking",
  "network ",
  "systems administration",
  "platform technolog",
  "emerging technolog",
  "embedded system",
  "computer organization",
  "cognate/professional course",
  "quantitative methods",
  "statistical",
  "numerical",
  "operations research",
  "mathematical modelling",
]

/** True when a laboratory subject is computer-based and therefore needs a COMPUTER_LAB. */
export function isComputerLabSubject(subject: RoomTypeSubject): boolean {
  const code = (subject.code ?? "").toUpperCase()
  if (COMPUTER_LAB_CODE_PREFIXES.some((p) => code.startsWith(p))) return true
  const title = ` ${(subject.title ?? "").toLowerCase()} `
  return COMPUTER_LAB_TITLE_KEYWORDS.some((kw) => title.includes(kw))
}

/**
 * The room types this subject may be scheduled in. Never empty — a subject
 * without an explicit requirement falls back to the type-based rules above.
 */
export function resolveRequiredRoomTypes(subject: RoomTypeSubject): RoomTypeValue[] {
  const explicit = (subject.requiredRoomType ?? []).filter(Boolean) as RoomTypeValue[]
  if (explicit.length > 0) return explicit
  if (subject.type === "LABORATORY") {
    return isComputerLabSubject(subject) ? ["COMPUTER_LAB"] : ["LABORATORY", "LECTURE_LAB"]
  }
  return ["LECTURE_ROOM", "LECTURE_LAB"]
}

export function roomTypeAllowedForSubject(roomType: string | null | undefined, subject: RoomTypeSubject): boolean {
  if (!roomType) return false
  return resolveRequiredRoomTypes(subject).includes(roomType as RoomTypeValue)
}

/** Human-readable "Computer Laboratory" / "Laboratory or Lecture + Lab Room" for messages. */
export function describeRequiredRoomTypes(subject: RoomTypeSubject): string {
  return resolveRequiredRoomTypes(subject)
    .map((t) => ROOM_TYPE_LABELS[t] ?? t.replace(/_/g, " "))
    .join(" or ")
}
