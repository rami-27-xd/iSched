import { db } from "@/lib/db"

/**
 * Allocated instructors (approved FacultyRequest rows).
 *
 * When the Department Chairperson approves a Program Chairperson's faculty
 * request they allocate an instructor AND set that instructor's FIXED
 * availability for the program — the weekly windows in which the instructor may
 * be scheduled on that program's classes. From then on the instructor
 *   - is listed on the Program Chairperson's Faculty page (as "allocated"),
 *   - is offered by Add Entry and used by Generate for that program's sections,
 *   - but is only ever scheduled inside those fixed windows (their own recorded
 *     availability is NOT used for the program's classes).
 * Legacy approvals made before fixed windows existed carry no slots and keep the
 * old behaviour (the instructor's own availability).
 */
export interface AvailabilitySlot {
  day: string
  startTime: string
  endTime: string
}

/**
 * `FacultyRequest.allocatedAvailability` was added after the first deployment. Until
 * `prisma db push` has run on a database, selecting it makes EVERY faculty-request
 * query fail ("Internal server error"). This checks once whether the column exists and
 * returns the `omit` to use: undefined when it does, `{ allocatedAvailability: true }`
 * when it does not (requests still work; fixed windows just can't be stored yet).
 */
let columnChecked: boolean | null = null
export async function requestOmit(): Promise<{ allocatedAvailability: true } | undefined> {
  if (columnChecked === null) {
    try {
      const rows = await db.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM information_schema.columns WHERE table_name = 'FacultyRequest' AND column_name = 'allocatedAvailability' LIMIT 1`
      columnChecked = rows.length > 0
    } catch {
      columnChecked = false
    }
  }
  return columnChecked ? undefined : { allocatedAvailability: true }
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Validates the slots sent by the approve dialog; returns an error message or the clean list. */
export function parseSlots(input: unknown): { ok: true; slots: AvailabilitySlot[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "Add at least one fixed availability window for the allocated instructor" }
  }
  const slots: AvailabilitySlot[] = []
  for (const raw of input) {
    const day = String((raw as any)?.day ?? "")
    const startTime = String((raw as any)?.startTime ?? "")
    const endTime = String((raw as any)?.endTime ?? "")
    if (!DAYS.includes(day)) return { ok: false, error: `"${day}" is not a valid day` }
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return { ok: false, error: "Times must look like 08:00" }
    if (startTime >= endTime) return { ok: false, error: `${day}: the end time must be after the start time` }
    if (startTime < "07:30" || endTime > "20:00") return { ok: false, error: `${day}: windows must sit between 7:30 AM and 8:00 PM` }
    slots.push({ day, startTime, endTime })
  }
  return { ok: true, slots }
}

/** Reads the stored JSON back into slots (tolerates null / bad data). */
export function readSlots(json: unknown): AvailabilitySlot[] {
  if (!Array.isArray(json)) return []
  return json
    .map((r: any) => ({ day: String(r?.day ?? ""), startTime: String(r?.startTime ?? ""), endTime: String(r?.endTime ?? "") }))
    .filter((s) => DAYS.includes(s.day) && TIME_RE.test(s.startTime) && TIME_RE.test(s.endTime))
}

/**
 * facultyId → fixed windows, for the instructors allocated to `programId` in
 * `semesterId` (any term when omitted). Instructors approved without windows
 * (legacy) are absent from the map but still listed in `ids`.
 */
export async function getProgramAllocations(
  programId: string | null | undefined,
  semesterId?: string | null
): Promise<{ ids: string[]; slotsByFaculty: Map<string, AvailabilitySlot[]> }> {
  const slotsByFaculty = new Map<string, AvailabilitySlot[]>()
  if (!programId) return { ids: [], slotsByFaculty }
  const omit = await requestOmit()
  const rows: { facultyId: string | null; allocatedAvailability?: unknown }[] = await db.facultyRequest.findMany({
    where: { status: "APPROVED", programId, facultyId: { not: null }, ...(semesterId ? { semesterId } : {}) },
    omit: { ...(omit ?? {}), id: false } as any,
  })
  const ids: string[] = []
  for (const r of rows) {
    const fid = r.facultyId as string
    if (!ids.includes(fid)) ids.push(fid)
    const slots = readSlots(r.allocatedAvailability)
    if (slots.length > 0) slotsByFaculty.set(fid, [...(slotsByFaculty.get(fid) ?? []), ...slots])
  }
  return { ids, slotsByFaculty }
}
