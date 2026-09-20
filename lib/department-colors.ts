/**
 * One colour per department (= per college, since each college has exactly one
 * department in this system). Client-safe. Used by every System Logs tab —
 * Classes, Subject Summary, Room Occupancy, Schedules — so a reader learns
 * "CIT is blue" once and it holds everywhere.
 *
 * Known abbreviations get a fixed slot; anything else hashes into the palette,
 * so a newly-added department still gets a stable colour without a code change.
 */

export interface DeptColor {
  /** Light fill for chips, grid blocks and row tints. */
  bg: string
  /** Text on `bg`. */
  fg: string
  /** Border / strong accent (also the solid dot in legends). */
  border: string
}

const PALETTE: DeptColor[] = [
  { bg: "#DCEBE3", fg: "#1B4332", border: "#1B4332" }, // brand green
  { bg: "#DBEAFE", fg: "#1E3A8A", border: "#3B82F6" }, // blue
  { bg: "#FBF0D0", fg: "#7A5A0E", border: "#D4AF37" }, // brand gold
  { bg: "#FCE7F3", fg: "#831843", border: "#EC4899" }, // pink
  { bg: "#EDE9FE", fg: "#4C1D95", border: "#8B5CF6" }, // violet
  { bg: "#FFEDD5", fg: "#7C2D12", border: "#F97316" }, // orange
  { bg: "#CCFBF1", fg: "#134E4A", border: "#14B8A6" }, // teal
  { bg: "#FEE2E2", fg: "#7F1D1D", border: "#EF4444" }, // red
  { bg: "#E0F2FE", fg: "#0C4A6E", border: "#0EA5E9" }, // sky
  { bg: "#FEF9C3", fg: "#713F12", border: "#EAB308" }, // yellow
  { bg: "#F3E8FF", fg: "#581C87", border: "#A855F7" }, // purple
  { bg: "#ECFCCB", fg: "#365314", border: "#84CC16" }, // lime
]

/** Fixed slots for the colleges/departments of SLSU-Lucban. */
const KNOWN: Record<string, number> = {
  CAS: 0,
  CIT: 1,
  CTE: 2,
  CEN: 3,
  CAM: 4,
  CABHA: 5,
  CAG: 6,
  CAHM: 7,
}

const FALLBACK: DeptColor = { bg: "#F3F4F6", fg: "#374151", border: "#6B7280" }

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function departmentColor(abbreviation: string | null | undefined): DeptColor {
  const key = (abbreviation ?? "").trim().toUpperCase()
  if (!key) return FALLBACK
  const known = KNOWN[key]
  if (known !== undefined) return PALETTE[known]
  // Skip the fixed slots so a new department never collides with a known one.
  const free = PALETTE.map((_, i) => i).filter((i) => !Object.values(KNOWN).includes(i))
  return PALETTE[free[hash(key) % free.length]]
}

/** Inline style for a chip / badge in the department's colour. */
export function departmentChipStyle(abbreviation: string | null | undefined): React.CSSProperties {
  const c = departmentColor(abbreviation)
  return { background: c.bg, color: c.fg, borderColor: c.border }
}
