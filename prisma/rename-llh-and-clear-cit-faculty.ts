/**
 * One-time data fixes (panel round, 2026-09-23), run against local dev by default:
 *
 *   1. Renames the CAS "Languages, Literature, and Humanities" FacultyCluster row
 *      to "Language, Communication, and Humanities" (matches the source-code rename
 *      already applied across prisma/*.ts, lib/services/subject-permissions.ts,
 *      app/api/faculty/route.ts, app/api/users/me/route.ts).
 *   2. Clears every CIT faculty record — full wipe, nothing re-added. Deletes the
 *      schedule entries and teaching loads that reference them first (no cascade on
 *      those relations), nulls out any FacultyRequest.facultyId pointing at them,
 *      then deletes the Faculty rows and any now-orphaned stub User rows
 *      (supabaseId LIKE 'manual-%'). Real login accounts (the Program Chairs) keep
 *      their User row — only their Faculty/teaching-record link goes.
 *
 * Already run against production (Supabase project qqxxjhojadmzyvpdyjvc) directly.
 * This script targets whatever DATABASE_URL is set — point it at the Supabase
 * session-pooler URL to re-run there; it's idempotent (no-ops if already applied).
 *
 *   npx tsx --env-file=.env prisma/rename-llh-and-clear-cit-faculty.ts [--dry-run]
 */
import { db } from "../lib/db"

const DRY = process.argv.includes("--dry-run")

async function main() {
  // ── 1. Rename the LLH cluster ─────────────────────────────────────────────
  const oldName = "Languages, Literature, and Humanities"
  const newName = "Language, Communication, and Humanities"
  const cluster = await db.facultyCluster.findFirst({ where: { name: oldName } })
  if (cluster) {
    console.log(`Cluster: "${oldName}" -> "${newName}"${DRY ? " (dry run)" : ""}`)
    if (!DRY) await db.facultyCluster.update({ where: { id: cluster.id }, data: { name: newName } })
  } else {
    const already = await db.facultyCluster.findFirst({ where: { name: newName } })
    console.log(already ? `Cluster already renamed to "${newName}" — nothing to do.` : `Cluster "${oldName}" not found — nothing to rename.`)
  }

  // ── 2. Clear CIT faculty ──────────────────────────────────────────────────
  const cit = await db.department.findFirst({ where: { college: { abbreviation: "CIT" } }, select: { id: true, name: true } })
  if (!cit) throw new Error("CIT department not found")

  const citFaculty = await db.faculty.findMany({
    where: { departmentId: cit.id },
    select: { id: true, userId: true, user: { select: { supabaseId: true } } },
  })
  if (citFaculty.length === 0) {
    console.log(`\n${cit.name}: no faculty records — nothing to clear.`)
    return
  }
  const facultyIds = citFaculty.map((f) => f.id)
  const stubUserIds = citFaculty.filter((f) => f.user.supabaseId.startsWith("manual-")).map((f) => f.userId)

  const [entryCount, loadCount, requestCount] = await Promise.all([
    db.scheduleEntry.count({ where: { facultyId: { in: facultyIds } } }),
    db.teachingLoad.count({ where: { facultyId: { in: facultyIds } } }),
    db.facultyRequest.count({ where: { facultyId: { in: facultyIds } } }),
  ])
  console.log(
    `\n${cit.name}: clearing ${citFaculty.length} faculty record(s)${DRY ? " (dry run)" : ""} — ` +
      `${entryCount} schedule entries, ${loadCount} teaching loads, ${requestCount} faculty requests to unlink, ` +
      `${stubUserIds.length} stub user(s) to remove (${citFaculty.length - stubUserIds.length} real login accounts kept)`
  )

  if (!DRY) {
    await db.$transaction([
      db.scheduleEntry.deleteMany({ where: { facultyId: { in: facultyIds } } }),
      db.teachingLoad.deleteMany({ where: { facultyId: { in: facultyIds } } }),
      db.facultyRequest.updateMany({ where: { facultyId: { in: facultyIds } }, data: { facultyId: null } }),
      db.faculty.deleteMany({ where: { id: { in: facultyIds } } }), // availability rows cascade
      db.user.deleteMany({ where: { id: { in: stubUserIds }, supabaseId: { startsWith: "manual-" } } }),
    ])
  }

  const remaining = await db.faculty.count({ where: { departmentId: cit.id } })
  console.log(DRY ? "\nDry run — nothing written." : `\nDone. CIT faculty remaining: ${remaining}.`)
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) }).finally(() => db.$disconnect())
