/**
 * Creates the three PATHFit venues (Gymnasium, Covered Court, Field):
 *   (TBA faculty and room are retired.)
 *
 * All upserts — safe to re-run. The generate route calls the same helpers on
 * every Dept Chair run, so this script is only needed to pre-create the rows
 * (e.g. so the GYM shows up in Buildings & Rooms before the first generation).
 *
 * Run:  npx tsx --env-file=.env prisma/seed-sentinels.ts
 */
import { db } from "../lib/db"
import { ensurePathfitVenues } from "../lib/services/sentinels"

async function main() {
  // TBA faculty / room are retired — only the three PATHFit venues are created.
  const venues = await ensurePathfitVenues()
  console.log("PATHFit venues ready:")
  for (const [code, id] of Object.entries(venues)) console.log(`  ${code.padEnd(14)} ${id}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
