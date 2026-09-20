/**
 * Per-day session length rules. Client-safe (no database imports) — shared by
 * the engine (via the generate route), lib/services/entry-validation.ts, the
 * Subjects form and the Add/Edit Entry time pickers so all four agree.
 *
 * GEC/GEL subjects are capped per day: a 3-hour GEC meets as 1h×3 (MWF/TThS)
 * or 1.5h×2 (TTh/MW/…) and is never a single 3-hour block. The Department
 * Chairperson picks the cap per subject on the Subjects page (1 hour or 1 hour
 * 30 minutes); a GEC/GEL subject with nothing set uses the 1h 30min default.
 * Every other subject has no cap unless one is set explicitly.
 */

export const DEFAULT_GEC_MAX_MINUTES_PER_DAY = 90

/** The choices offered on the Subjects page. */
export const SESSION_CAP_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1 hour 30 minutes" },
]

export function isGecCode(code: string | null | undefined): boolean {
  const c = (code ?? "").toUpperCase()
  return c.startsWith("GEC") || c.startsWith("GEL")
}

/** "1 hour", "1 hour 30 minutes", "2 hours", "45 minutes". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`)
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`)
  return parts.join(" ") || "0 minutes"
}

/**
 * The longest single session (minutes) this subject may hold on one day, or
 * null when it has no cap. Explicit `maxMinutesPerDay` wins; otherwise GEC/GEL
 * default to DEFAULT_GEC_MAX_MINUTES_PER_DAY.
 */
export function resolveMaxMinutesPerDay(subject: {
  code?: string | null
  maxMinutesPerDay?: number | null
}): number | null {
  if (subject.maxMinutesPerDay && subject.maxMinutesPerDay > 0) return subject.maxMinutesPerDay
  return isGecCode(subject.code) ? DEFAULT_GEC_MAX_MINUTES_PER_DAY : null
}

/** Whether the per-day rule applies to (and is shown for) this subject. */
export function hasSessionCap(subject: { code?: string | null; maxMinutesPerDay?: number | null }): boolean {
  return resolveMaxMinutesPerDay(subject) !== null
}
