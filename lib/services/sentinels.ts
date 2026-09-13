import { db } from "@/lib/db"
import {
  TBA_EMPLOYEE_ID, TBA_ROOM_CODE, GYM_ROOM_CODE, GYM_BUILDING_CODE,
} from "@/lib/sentinels"

/**
 * Server-side "make sure it exists" helpers for the placeholder resources
 * described in lib/sentinels.ts. Each is an idempotent upsert, so the generate
 * route can call them on every run instead of depending on a one-off seed
 * having been executed against every database (local, staging, production).
 */

export async function ensureTbaFaculty(): Promise<{ id: string }> {
  const existing = await db.faculty.findUnique({ where: { employeeId: TBA_EMPLOYEE_ID }, select: { id: true } })
  if (existing) return existing

  // Faculty.departmentId is required but never used to gate the sentinel's
  // visibility (the faculty list API includes employeeId "TBA" unconditionally),
  // so any department works — CAS exists in every install.
  const dept =
    (await db.department.findFirst({ where: { abbreviation: "CAS" }, select: { id: true } })) ??
    (await db.department.findFirst({ select: { id: true } }))
  if (!dept) throw new Error("Cannot create the TBA faculty placeholder: no department exists yet")

  let user = await db.user.findFirst({ where: { supabaseId: "manual-tba-sentinel" }, select: { id: true } })
  if (!user) {
    user = await db.user.create({
      data: {
        supabaseId: "manual-tba-sentinel",
        email: null,
        firstName: "To Be",
        lastName: "Announced",
        role: "FACULTY",
        isApproved: false,
        departmentId: dept.id,
      },
      select: { id: true },
    })
  }

  return db.faculty.upsert({
    where: { employeeId: TBA_EMPLOYEE_ID },
    update: {},
    create: {
      userId: user.id,
      departmentId: dept.id,
      employeeId: TBA_EMPLOYEE_ID,
      specializations: [],
      sectionCounts: {},
      maxUnitsPerWeek: 0,
      hoursPerWeek: 0,
      isActive: true,
    },
    select: { id: true },
  })
}

export async function ensureTbaRoom(): Promise<{ id: string }> {
  const building = await db.building.upsert({
    where: { code: TBA_ROOM_CODE },
    update: {},
    create: { name: "To Be Announced", code: TBA_ROOM_CODE, isActive: true },
    select: { id: true },
  })
  return db.room.upsert({
    where: { code: TBA_ROOM_CODE },
    update: {},
    create: { name: "To Be Announced", code: TBA_ROOM_CODE, buildingId: building.id, type: "LECTURE_ROOM", isActive: true },
    select: { id: true },
  })
}

/**
 * The GYM: building "GYM" / room "GYM". Every PATHFIT class is placed here by
 * the generator. No DepartmentRoom / ProgramRoom rows, so it is open to every
 * section ("zero entries = unrestricted").
 */
export async function ensureGymRoom(): Promise<{ id: string; buildingId: string }> {
  const building = await db.building.upsert({
    where: { code: GYM_BUILDING_CODE },
    update: {},
    create: { name: "Gymnasium", code: GYM_BUILDING_CODE, isActive: true },
    select: { id: true },
  })
  const room = await db.room.upsert({
    where: { code: GYM_ROOM_CODE },
    update: {},
    create: { name: "Gymnasium", code: GYM_ROOM_CODE, buildingId: building.id, type: "LECTURE_ROOM", isActive: true },
    select: { id: true, buildingId: true },
  })
  return room
}

/** Convenience: everything the PATHFIT pass needs, in one call. */
export async function ensurePathfitSentinels(): Promise<{ tbaFacultyId: string; gymRoomId: string }> {
  const [tba, gym] = await Promise.all([ensureTbaFaculty(), ensureGymRoom()])
  return { tbaFacultyId: tba.id, gymRoomId: gym.id }
}
