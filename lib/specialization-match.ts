/**
 * Faculty ↔ subject specialization matching.
 *
 * ONE definition, shared by the Add/Edit Entry pickers (which decide who is
 * offered) and lib/services/entry-validation.ts (which decides who is accepted).
 * When these two drifted apart the result was a dead end: the dropdown listed a
 * faculty member the server then refused to save.
 *
 * Specializations are chair-entered strings that are supposed to mirror a subject
 * title, but in practice they get abbreviated — "Science, Tech, Society" against a
 * subject titled "Science, Technology and Society" is the same expertise written
 * shorter. A plain substring test says no (neither contains the other, and "Tech"
 * is not "Technology"), which surfaced as "No faculty found" on subjects that did
 * have specialists.
 *
 * So the comparison runs in two stages: the cheap exact/substring test first, then
 * a word-level comparison that tolerates abbreviation.
 */

/** Filler words that carry no subject meaning. */
const SPEC_STOPWORDS = new Set(["and", "of", "the", "for", "to", "in", "a", "an", "with", "&"])

/** Lowercase, strip punctuation, drop filler words → significant word list. */
export function specTokens(value: string): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SPEC_STOPWORDS.has(t))
}

/**
 * Is every significant word in `needle` accounted for in `haystack`?
 * Words match exactly or by prefix, so "tech" covers "technology". The length
 * floor keeps one- and two-letter fragments from matching everything.
 */
function tokensCover(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0) return false
  return needle.every((t) =>
    haystack.some(
      (u) => u === t || (t.length >= 3 && u.startsWith(t)) || (u.length >= 3 && t.startsWith(u))
    )
  )
}

/**
 * Does any of `specializations` cover `subjectTitle`?
 *
 * An empty specialization list is NOT a wildcard — it returns false, matching the
 * engine's own rule that a faculty member with nothing recorded is never
 * auto-assigned. A subject with no title returns true (nothing to check against).
 */
export function specializationsCoverSubject(
  specializations: string[] | null | undefined,
  subjectTitle: string | null | undefined
): boolean {
  const title = (subjectTitle ?? "").toLowerCase().trim()
  if (!title) return true
  const specs = specializations ?? []
  if (specs.length === 0) return false

  const titleTokens = specTokens(title)
  return specs.some((raw) => {
    const sp = (raw ?? "").toLowerCase().trim()
    if (!sp) return false
    if (sp === title || title.includes(sp) || sp.includes(title)) return true
    const spTokens = specTokens(sp)
    return tokensCover(spTokens, titleTokens) || tokensCover(titleTokens, spTokens)
  })
}

/** Convenience wrapper for the shapes the UI holds (a faculty row + a subject row). */
export function facultyMatchesSubject(faculty: any, subject: any): boolean {
  return specializationsCoverSubject(faculty?.specializations, subject?.title)
}
