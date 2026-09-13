/**
 * Seeds every placeholder resource the scheduler relies on:
 *   - "TBA" faculty + "TBA" room (manual resolution of unassigned items)
 *   - "GYM" building + room       (venue of every auto-generated PATHFIT class)
 *
 * All upserts — safe to re-run. The generate route calls the same helpers on
 * every Dept Chair run, so this script is only needed to pre-create the rows
 * (e.g. so the GYM shows up in Buildings & Rooms before the first generation).
 *
 * Run:  npx tsx --env-file=.env prisma/seed-sentinels.ts
 */
import { db } from "../lib/db"
import { ensureTbaFaculty, ensureTbaRoom, ensureGymRoom } from "../lib/services/sentinels"

async function main() {
  const [tbaFaculty, tbaRoom, gym] = await Promise.all([ensureTbaFaculty(), ensureTbaRoom(), ensureGymRoom()])
  console.log("Placeholders ready:")
  console.log(`  TBA faculty: ${tbaFaculty.id}`)
  console.log(`  TBA room:    ${tbaRoom.id}`)
  console.log(`  GYM room:    ${gym.id} (building ${gym.buildingId})`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
