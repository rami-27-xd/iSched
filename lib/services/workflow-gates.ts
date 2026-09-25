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

// ─── Program Chairpersons: "done plotting" ────────────────────────────────────
//
// Spec (2026-09-26): each Program Chairperson marks their program's subjects as
// DONE for a schedule; the department's schedule can be submitted for the
// Dean's approval only once EVERY Program Chairperson of the department is
// done. "Every" = each program of the department that has an approved, active
// Program Chairperson — a program nobody chairs can never be marked, so it
// cannot hold the department hostage. Like GEC/GEL finalization this is a
// deliberate declaration (ProgramFinalization), reopened automatically when that
// chairperson adds, edits or deletes a class, or regenerates.

export interface ProgramFinalizationEntry {
  programId: string
  abbreviation: string
  name: string
  /** The Program Chairperson(s) who can mark this program done. */
  chairs: { id: string; name: string }[]
  finalized: boolean
  finalizedBy: string | null
  finalizedAt: Date | null
}

export interface ProgramFinalizationStatus {
  programs: ProgramFinalizationEntry[]
  done: number
  total: number
  /** True only when at least one program counts and every one is done. */
  allFinalized: boolean
}

export async function getProgramFinalizationStatus(
  scheduleId: string,
  departmentId: string | null | undefined
): Promise<ProgramFinalizationStatus> {
  if (!departmentId) return { programs: [], done: 0, total: 0, allFinalized: false }

  const [programs, rows] = await Promise.all([
    db.program.findMany({
      where: {
        departmentId,
        head: { user: { role: "ADMIN", isApproved: true, isActive: true } },
      },
      select: {
        id: true,
        abbreviation: true,
        name: true,
        head: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { abbreviation: "asc" },
    }),
    db.programFinalization.findMany({
      where: { scheduleId },
      select: { programId: true, finalizedBy: true, finalizedAt: true },
    }),
  ])

  const byProgram = new Map(rows.map((r) => [r.programId, r]))
  const finalizerIds = [...new Set(rows.map((r) => r.finalizedBy))]
  const finalizers = finalizerIds.length
    ? await db.user.findMany({ where: { id: { in: finalizerIds } }, select: { id: true, firstName: true, lastName: true } })
    : []
  const nameById = new Map(finalizers.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))

  const out: ProgramFinalizationEntry[] = programs.map((p) => {
    const row = byProgram.get(p.id)
    const chair = p.head?.user
    return {
      programId: p.id,
      abbreviation: p.abbreviation,
      name: p.name,
      chairs: chair ? [{ id: chair.id, name: `${chair.firstName} ${chair.lastName}`.trim() }] : [],
      finalized: !!row,
      finalizedBy: row ? nameById.get(row.finalizedBy) ?? null : null,
      finalizedAt: row?.finalizedAt ?? null,
    }
  })
  const done = out.filter((p) => p.finalized).length
  return { programs: out, done, total: out.length, allFinalized: out.length > 0 && done === out.length }
}

/**
 * The signed-in Program Chairperson just added, edited or deleted a class (or
 * regenerated) in this schedule — their "done" declaration is stale, so reopen
 * it. Best-effort: the class change itself has already been saved, and a
 * bookkeeping failure must not turn that into an error response.
 */
export async function reopenProgramIfStale(scheduleId: string, dbUser: any): Promise<void> {
  if (dbUser?.role !== "ADMIN") return
  const programId = dbUser.programHead?.programId as string | undefined
  if (!programId) return
  try {
    await db.programFinalization.deleteMany({ where: { scheduleId, programId } })
  } catch (err) {
    console.error("[workflow-gates] reopenProgramIfStale failed:", err)
  }
}

export const PROGRAMS_FIRST_MESSAGE =
  "Every Program Chairperson in your department must mark their subjects as done before this schedule can be submitted for the Dean's approval."
