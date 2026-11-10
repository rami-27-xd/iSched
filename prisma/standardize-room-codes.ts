/**
 * One-off: bring every room code to the standard <BUILDING CODE>-<ROOM> (lib/room-code.ts).
 *
 *   npx tsx --env-file=.env prisma/standardize-room-codes.ts           # preview
 *   npx tsx --env-file=.env prisma/standardize-room-codes.ts --apply   # write
 *
 * Rooms keep their id, so every scheduled class stays attached; only the code text changes.
 * Targets whatever DATABASE_URL is set (point it at the Supabase pooler for production).
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { formatRoomCode, roomCodeProblem, isExemptRoomCode } from "../lib/room-code"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

// Old room prefix -> the building's code, where they differed.
const OLD_PREFIX: Record<string, string> = { HP: "HPB", JPR: "JPRB", EAB: "ICT", ABB: "CIT", CTE: "CTEB" }
// Rooms whose number was mistyped; the campus map shows CEN RM 214.
const FIXES: Record<string, string> = { "MDP-2014": "MDP-214" }

async function main() {
  const apply = process.argv.includes("--apply")
  const rooms = await db.room.findMany({ include: { building: true }, orderBy: { code: "asc" } })
  const taken = new Set(rooms.map((r: any) => r.code))
  const plan: { id: string; from: string; to: string }[] = []
  const problems: string[] = []

  for (const r of rooms as any[]) {
    if (isExemptRoomCode(r.code)) continue
    let rest = FIXES[r.code] ?? r.code
    const dash = rest.indexOf("-")
    const head = dash > 0 ? rest.slice(0, dash) : ""
    if (OLD_PREFIX[head]) rest = rest.slice(dash + 1)
    const to = formatRoomCode(r.building?.code, rest)
    const problem = roomCodeProblem(r.building?.code, to)
    if (problem) { problems.push(`${r.code}: ${problem}`); continue }
    if (to !== r.code) plan.push({ id: r.id, from: r.code, to })
  }

  const targets = new Map<string, string>()
  for (const p of plan) {
    if (targets.has(p.to)) problems.push(`${p.from} and ${targets.get(p.to)} would both become ${p.to}`)
    targets.set(p.to, p.from)
    if (taken.has(p.to) && !plan.some((q) => q.from === p.to)) problems.push(`${p.from} -> ${p.to} is already used`)
  }

  plan.forEach((p) => console.log(`${p.from.padEnd(16)} -> ${p.to}`))
  console.log(`\n${plan.length} room code(s) to change, ${problems.length} problem(s)`)
  problems.forEach((p) => console.log("  !", p))
  if (!apply || problems.length) { if (!apply) console.log("Preview only — add --apply to write."); return }

  // Two-step so a swap can never collide on the unique index.
  await db.$transaction([
    ...plan.map((p) => db.room.update({ where: { id: p.id }, data: { code: `__tmp_${p.id}` } })),
    ...plan.map((p) => db.room.update({ where: { id: p.id }, data: { code: p.to } })),
  ])
  console.log("Done.")
}
main().finally(() => db.$disconnect())
