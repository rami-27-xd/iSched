/**
 * Seeds the "TBA" (To Be Announced) sentinel faculty + room, used by chairs to
 * manually resolve an Unassigned Queue entry when no real faculty/room can be
 * placed yet (e.g. no one has the right specialization, or every room is
 * booked). TBA is a real Faculty/Room row — not a schema null — so it drops
 * into every existing Add/Edit Entry dropdown, export, and display path with
 * zero special-casing there. It is a SINGLE global sentinel, identified by:
 *   Faculty.employeeId === "TBA"
 *   Room.code           === "TBA"
 * Those two constants are the only thing that needs to stay in sync with the
 * exemption checks in lib/services/entry-validation.ts, entries/route.ts, and
 * the schedules page's client-side pre-checks and room/faculty pickers.
 *
 * Run:  npx tsx --env-file=.env prisma/seed-tba.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  // ── Building + Room ────────────────────────────────────────────────────
  // A real Building is required (Room.buildingId is a non-null FK). Chosen to
  // be obviously a placeholder, not a real campus building.
  const building = await db.building.upsert({
    where: { code: "TBA" },
    update: {},
    create: { name: "To Be Announced", code: "TBA", isActive: true },
  })

  const room = await db.room.upsert({
    where: { code: "TBA" },
    update: {},
    create: {
      name: "To Be Announced",
      code: "TBA",
      buildingId: building.id,
      type: "LECTURE_ROOM",
      isActive: true,
      // No DepartmentRoom/ProgramRoom rows — "zero entries = unrestricted" per
      // the existing room-access model, so it's open to every section already.
    },
  })

  // ── Stub user + Faculty ─────────────────────────────────────────────────
  // Faculty.departmentId is required but is NOT used to gate visibility for
  // this sentinel — the faculty list API explicitly includes employeeId="TBA"
  // regardless of department/cluster, so the department chosen here is
  // arbitrary. CAS is used since it's the one department every install has.
  const casDept = await db.department.findFirst({ where: { abbreviation: "CAS" } })
  if (!casDept) throw new Error("CAS department not found — seed departments first.")

  let user = await db.user.findFirst({ where: { supabaseId: "manual-tba-sentinel" } })
  if (!user) {
    user = await db.user.create({
      data: {
        supabaseId: "manual-tba-sentinel",
        email: null,
        firstName: "To Be",
        lastName: "Announced",
        role: "FACULTY",
        isApproved: false,
        departmentId: casDept.id,
      },
    })
  }

  const faculty = await db.faculty.upsert({
    where: { employeeId: "TBA" },
    update: {},
    create: {
      userId: user.id,
      departmentId: casDept.id,
      employeeId: "TBA",
      specializations: [],
      sectionCounts: {},
      maxUnitsPerWeek: 0, // meaningless for the sentinel — capacity checks are exempted for it
      hoursPerWeek: 0,
      isActive: true,
    },
  })

  console.log("TBA sentinel ready:")
  console.log(`  Building: ${building.name} (${building.id})`)
  console.log(`  Room:     ${room.name} — code "${room.code}" (${room.id})`)
  console.log(`  Faculty:  ${user.firstName} ${user.lastName} — employeeId "${faculty.employeeId}" (${faculty.id})`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
