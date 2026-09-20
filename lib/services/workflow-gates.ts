import { db } from "@/lib/db"

/**
 * Workflow gate (spec: "the three department chairpersons handling GEC/GEL
 * subjects must complete their scheduling before their schedules become
 * visible to the program chairpersons"). Program Chairpersons unlock Add
 * Entry / Generate / Submit for their major subjects (beyond the CIT
 * laboratory pre-plot, which is unaffected — it happens before any of this)
 * only once EVERY CAS cluster has explicitly finalized its GEC/GEL scheduling
 * for THIS schedule — see GecFinalization.
 *
 * "Finalized" is a deliberate action (`POST /api/schedules/[id]/gec-finalize`),
 * not inferred from entries existing: a cluster chair might place a few GEC
 * classes and stop there for the day, which must not unlock every Program
 * Chairperson early. Editing/regenerating a GEC/GEL entry for a cluster that
 * already finalized this schedule un-finalizes it again automatically (see
 * the entries and generate routes) — the declaration is stale the moment the
 * underlying entries change.
 */
export async function scheduleHasGec(scheduleId: string): Promise<boolean> {
  const n = await db.scheduleEntry.count({
    where: {
      scheduleId,
      OR: [
        { subject: { code: { startsWith: "GEC" } } },
        { subject: { code: { startsWith: "GEL" } } },
      ],
    },
  })
  return n > 0
}

export interface GecFinalizationStatus {
  totalClusters: number
  finalizedClusterIds: string[]
  allFinalized: boolean
}

/**
 * Per-department-head finalization status for a schedule. `allFinalized` is the
 * actual gate value; the rest is for the UI ("2 of 3 department heads finalized
 * — waiting on Mathematics and Natural Sciences"). (A "department head area" is
 * a FacultyCluster row — the UI never says "cluster".)
 */
export async function getGecFinalizationStatus(scheduleId: string): Promise<GecFinalizationStatus> {
  const [totalClusters, rows] = await Promise.all([
    db.facultyCluster.count(),
    db.gecFinalization.findMany({ where: { scheduleId }, select: { clusterId: true } }),
  ])
  const finalizedClusterIds = rows.map((r) => r.clusterId)
  return {
    totalClusters,
    finalizedClusterIds,
    // A university with zero clusters configured can't ever satisfy "every
    // cluster" — fail closed (never unlock) rather than vacuously true.
    allFinalized: totalClusters > 0 && finalizedClusterIds.length >= totalClusters,
  }
}

export async function isGecFinalized(scheduleId: string): Promise<boolean> {
  return (await getGecFinalizationStatus(scheduleId)).allFinalized
}

/**
 * A GEC/GEL entry for a cluster that already finalized this schedule was just
 * created, edited, or deleted (by hand or by regenerating) — the cluster's
 * declaration is stale the moment the underlying entries change, so reopen it.
 * A no-op when there was nothing to reopen, or for anyone but a CAS cluster
 * chair (SUPER_ADMIN with a clusterId) touching a GEC/GEL code.
 */
export async function reopenGecIfStale(scheduleId: string, subjectCode: string | null | undefined, dbUser: any): Promise<void> {
  if (dbUser?.role !== "SUPER_ADMIN") return
  const clusterId = dbUser.clusterId as string | null | undefined
  if (!clusterId) return
  const code = (subjectCode ?? "").toUpperCase()
  if (!(code.startsWith("GEC") || code.startsWith("GEL"))) return
  await db.gecFinalization.deleteMany({ where: { scheduleId, clusterId } })
}

export const GEC_FIRST_MESSAGE =
  "The three CAS department heads have not all finalized the GEC/GEL schedule for this term yet. Program Chairpersons add their major subjects only after every department head has finalized."
