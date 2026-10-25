import { db } from "@/lib/db"
import { reopenProgramIfStale } from "@/lib/services/workflow-gates"

/**
 * Undo / redo of schedule generation, per user and per schedule.
 *
 * Generate replaces a slice of the schedule (the run's subjects x sections).
 * `captureGenerationSnapshot` saves that slice just before it is replaced and
 * clears the redo stack; undo / redo swap the live slice with the top of the
 * matching stack.
 */

export interface SnapshotScope {
  subjectIds: string[]
  sectionIds: string[] | null
}

const MAX_STACK = 10

function sliceWhere(scheduleId: string, scope: SnapshotScope) {
  return scope.sectionIds
    ? { scheduleId, subjectId: { in: scope.subjectIds }, sectionId: { in: scope.sectionIds } }
    : { scheduleId, subjectId: { in: scope.subjectIds } }
}

async function readSlice(scheduleId: string, scope: SnapshotScope) {
  const where = sliceWhere(scheduleId, scope)
  const [entries, unassigned] = await Promise.all([
    db.scheduleEntry.findMany({ where }),
    db.unassignedEntry.findMany({ where }),
  ])
  return { entries, unassigned }
}

async function trim(scheduleId: string, userId: string, stack: "UNDO" | "REDO") {
  const rows = await db.scheduleSnapshot.findMany({
    where: { scheduleId, userId, stack },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: MAX_STACK,
  })
  if (rows.length > 0) await db.scheduleSnapshot.deleteMany({ where: { id: { in: rows.map((r: any) => r.id) } } })
}

/** Call right before a generation run deletes its slice. Best-effort: never blocks generation. */
export async function captureGenerationSnapshot(
  scheduleId: string,
  userId: string,
  scope: SnapshotScope
): Promise<void> {
  try {
    const { entries, unassigned } = await readSlice(scheduleId, scope)
    await db.scheduleSnapshot.create({
      data: { scheduleId, userId, stack: "UNDO", scope: scope as any, entries: entries as any, unassigned: unassigned as any },
    })
    await db.scheduleSnapshot.deleteMany({ where: { scheduleId, userId, stack: "REDO" } })
    await trim(scheduleId, userId, "UNDO")
  } catch (err) {
    console.error("[generation-history] capture failed:", err)
  }
}

export async function getHistoryState(scheduleId: string, userId: string) {
  const [undo, redo] = await Promise.all([
    db.scheduleSnapshot.count({ where: { scheduleId, userId, stack: "UNDO" } }),
    db.scheduleSnapshot.count({ where: { scheduleId, userId, stack: "REDO" } }),
  ])
  return { canUndo: undo > 0, canRedo: redo > 0 }
}

const stripDates = ({ createdAt, updatedAt, ...rest }: any) => rest

/** Swap the live slice with the newest snapshot of `from`; the old live slice goes onto `to`. */
export async function applyHistory(
  scheduleId: string,
  dbUser: any,
  from: "UNDO" | "REDO"
): Promise<{ ok: true; restored: number } | { ok: false; status: number; error: string }> {
  const to = from === "UNDO" ? "REDO" : "UNDO"
  const snap = await db.scheduleSnapshot.findFirst({
    where: { scheduleId, userId: dbUser.id, stack: from },
    orderBy: { createdAt: "desc" },
  })
  if (!snap) {
    return { ok: false, status: 400, error: from === "UNDO" ? "Nothing to undo" : "Nothing to redo" }
  }

  const scope = snap.scope as unknown as SnapshotScope
  const where = sliceWhere(scheduleId, scope)
  const current = await readSlice(scheduleId, scope)
  const entryRows = (snap.entries as any[]).map(stripDates)
  const unassignedRows = (snap.unassigned as any[]).map(stripDates)

  try {
    await db.$transaction([
      db.scheduleEntry.deleteMany({ where }),
      db.unassignedEntry.deleteMany({ where }),
      db.scheduleEntry.createMany({ data: entryRows as any }),
      db.unassignedEntry.createMany({ data: unassignedRows as any }),
      db.scheduleSnapshot.create({
        data: { scheduleId, userId: dbUser.id, stack: to, scope: scope as any, entries: current.entries as any, unassigned: current.unassigned as any },
      }),
      db.scheduleSnapshot.delete({ where: { id: snap.id } }),
      db.schedule.update({ where: { id: scheduleId }, data: { generatedAt: new Date() } }),
    ])
  } catch (err) {
    console.error("[generation-history] apply failed:", err)
    return {
      ok: false,
      status: 409,
      error: "That version can't be restored — a faculty, room, section or subject it uses no longer exists.",
    }
  }

  // The classes changed, so earlier "done" declarations are stale (as after Generate).
  if (dbUser.role === "SUPER_ADMIN" && dbUser.clusterId) {
    await db.gecFinalization.deleteMany({ where: { scheduleId, clusterId: dbUser.clusterId } }).catch(() => {})
  }
  await reopenProgramIfStale(scheduleId, dbUser)
  await trim(scheduleId, dbUser.id, to)
  return { ok: true, restored: entryRows.length }
}
