/**
 * Removes the retired "TBA" placeholders from a database.
 *
 * TBA (instructor and room) was retired on 2026-10-07: PATHFit classes now have a
 * real instructor and one of three venues (Gymnasium, Covered Court, Field). Classes
 * generated earlier still carry the TBA instructor and/or the old GYM-with-TBA data;
 * this deletes
 *   - every schedule entry taught by the TBA faculty, held in the TBA room, or whose
 *     free-text instructor name is "TBA" (the PATHFit Director regenerates them),
 *   - the TBA faculty record, its stub user, the TBA room and the TBA building.
 *
 * DRY RUN by default — it only prints what it would delete. Add --apply to delete.
 * Targets whatever DATABASE_URL is set (point it at production deliberately).
 *
 * Run:  npx tsx --env-file=.env prisma/remove-tba.ts          (preview)
 *       npx tsx --env-file=.env prisma/remove-tba.ts --apply  (delete)
 */
import { db } from "../lib/db"

async function main() {
  const apply = process.argv.includes("--apply")
  const tbaFaculty = await db.faculty.findUnique({ where: { employeeId: "TBA" }, select: { id: true, userId: true } })
  const tbaRoom = await db.room.findUnique({ where: { code: "TBA" }, select: { id: true, buildingId: true } })

  const entryWhere = {
    OR: [
      ...(tbaFaculty ? [{ facultyId: tbaFaculty.id }] : []),
      ...(tbaRoom ? [{ roomId: tbaRoom.id }] : []),
      { facultyName: { equals: "TBA", mode: "insensitive" as const } },
    ],
  }
  const entries = await db.scheduleEntry.count({ where: entryWhere })
  const unassigned = tbaFaculty ? await db.unassignedEntry.count({ where: { subject: { code: { startsWith: "PATHFIT", mode: "insensitive" } } } }).catch(() => 0) : 0

  console.log(`${apply ? "APPLY" : "DRY RUN"} — TBA clean-up`)
  console.log(`  schedule entries to delete : ${entries}`)
  console.log(`  TBA faculty record         : ${tbaFaculty ? "yes" : "none"}`)
  console.log(`  TBA room / building        : ${tbaRoom ? "yes" : "none"}`)
  void unassigned
  if (!apply) {
    console.log("\nNothing was changed. Re-run with --apply to delete.")
    return
  }

  await db.scheduleEntry.deleteMany({ where: entryWhere })
  if (tbaFaculty) {
    await db.facultyAvailability.deleteMany({ where: { facultyId: tbaFaculty.id } })
    await db.faculty.delete({ where: { id: tbaFaculty.id } }).catch((e) => console.log("  (faculty kept:", e.code ?? e.message, ")"))
    await db.user.delete({ where: { id: tbaFaculty.userId } }).catch(() => {})
  }
  if (tbaRoom) {
    await db.room.delete({ where: { id: tbaRoom.id } }).catch((e) => console.log("  (room kept:", e.code ?? e.message, ")"))
    await db.building.delete({ where: { id: tbaRoom.buildingId } }).catch(() => {})
  }
  console.log("Done. The PATHFit Director can now Generate PATHFit again.")
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
