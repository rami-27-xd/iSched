import { db } from "@/lib/db"

/**
 * Recomputes a faculty member's `sectionCounts` fresh from their actual schedule
 * entries (across all NON-ARCHIVED schedules in any status). Called whenever an
 * entry is created, updated, or deleted.
 *
 * IMPORTANT — this NO LONGER touches `specializations` (Section 7 / Bug 3 fix).
 * It previously MERGED every assigned subject's title back into `specializations`,
 * which silently polluted the chair's curated input with assignment history: after
 * each generation, every assigned faculty accumulated the titles they were placed on,
 * so the scheduler's specialization matching drifted further from the actual input
 * data on every run. `specializations` is now treated as chair-owned input only and
 * is never written here — the caller/UI is the sole source of truth for it.
 *
 * `sectionCounts` is still derived from entries: it is a per-title count of how many
 * distinct sections the faculty currently teaches, used only as a max-sections cap by
 * the engine — not as a matching signal — so recomputing it from entries is correct.
 *
 * It ALSO recomputes `hoursPerWeek` from the actual scheduled sessions (end − start of
 * every entry) so a faculty's weekly contact hours auto-mirror their real assignments
 * everywhere they're shown (Faculty page, schedule view) instead of a stale manual value.
 */
export async function syncFacultySpecializations(facultyId: string): Promise<void> {
  if (!facultyId) return

  const entries = await db.scheduleEntry.findMany({
    // Archived schedules are finished terms — their classes must not inflate
    // the load / section counts availability checks are made against.
    where: { facultyId, schedule: { isArchived: false } },
    select: {
      sectionId: true,
      day: true,
      startTime: true,
      endTime: true,
      mergeGroupId: true,
      subject: { select: { title: true } },
    },
  })

  // subject title → Set of distinct sectionIds
  const map = new Map<string, Set<string>>()
  let totalMinutes = 0
  // A merged NSTP class is one row per section but ONE block of teaching time.
  const countedMergedBlocks = new Set<string>()
  for (const e of entries) {
    const title = e.subject?.title
    if (title) {
      if (!map.has(title)) map.set(title, new Set())
      map.get(title)!.add(e.sectionId)
    }
    if (e.mergeGroupId) {
      const key = `${e.mergeGroupId}|${e.day}|${e.startTime}|${e.endTime}`
      if (countedMergedBlocks.has(key)) continue
      countedMergedBlocks.add(key)
    }
    const [sh, sm] = e.startTime.split(":").map(Number)
    const [eh, em] = e.endTime.split(":").map(Number)
    totalMinutes += eh * 60 + em - (sh * 60 + sm)
  }

  const sectionCounts: Record<string, number> = {}
  for (const [title, sections] of map) {
    sectionCounts[title] = sections.size
  }

  await db.faculty.update({
    where: { id: facultyId },
    data: { sectionCounts, hoursPerWeek: Math.round(totalMinutes / 60) },
  })
}
