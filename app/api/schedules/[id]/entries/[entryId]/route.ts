import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { validateEntry, validateEntryCapacity, isHardConflict, stripConflictMarker } from "@/lib/services/entry-validation"
import { syncFacultySpecializations } from "@/lib/services/sync-specializations"
import { checkSubjectEditPermission } from "@/lib/services/subject-permissions"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser) {
      return NextResponse.json(apiError("User not found"), { status: 404 })
    }

    const { id, entryId } = await params
    const body = await req.json()

    const schedule = await db.schedule.findUnique({ where: { id } })
    if (!schedule) {
      return NextResponse.json(apiError("Schedule not found"), { status: 400 })
    }

    const entry = await db.scheduleEntry.findUnique({ where: { id: entryId } })
    if (!entry) {
      return NextResponse.json(apiError("Entry not found"), { status: 404 })
    }

    // Permission rules (two-phase workflow):
    // - SUPER_ADMIN: full access on any status — they manage GEC entries (Phase 1) and
    //   review/correct Program Chair entries (Phase 2 conflict resolution).
    // - ADMIN: full access on their own DRAFT (Phase 2 major subjects only).
    if (dbUser.role === "SUPER_ADMIN") {
      // Any status — but subject ownership is checked below
    } else if (dbUser.role === "ADMIN" && schedule.status === "DRAFT") {
      // Own DRAFT — subject ownership checked below
    } else {
      return NextResponse.json(apiError("You don't have permission to modify this schedule"), { status: 403 })
    }

    // Subject ownership: check both the entry's current subject and (if changing) the new one
    const permError =
      (await checkSubjectEditPermission(dbUser, entry.subjectId)) ??
      (body.subjectId && body.subjectId !== entry.subjectId
        ? await checkSubjectEditPermission(dbUser, body.subjectId)
        : null)
    if (permError) {
      return NextResponse.json(apiError(permError), { status: 403 })
    }

    // Merge current entry data with updates for validation
    const merged = {
      subjectId: body.subjectId ?? entry.subjectId,
      facultyId: body.facultyId ?? entry.facultyId,
      roomId: body.roomId ?? entry.roomId,
      sectionId: body.sectionId ?? entry.sectionId,
      day: body.day ?? entry.day,
      startTime: body.startTime ?? entry.startTime,
      endTime: body.endTime ?? entry.endTime,
      set: body.set !== undefined ? body.set : entry.set,
    }

    const validationError = await validateEntry(id, merged, entryId)
    // force: true = soft-validation — save anyway and return warning instead of blocking.
    // Two classes of error are never overridable:
    //   1. The Saturday restriction (CAM/NSTP only) — a compliance hard constraint.
    //   2. Faculty/room double-booking (isHardConflict) — a physical impossibility,
    //      and the one that let cross-department clashes through: adding a
    //      conflicting entry was already blocked, but MOVING a clean entry onto
    //      another department's slot and force-saving was not.
    const force =
      body.force === true &&
      !validationError?.includes("Saturday classes are reserved") &&
      !isHardConflict(validationError)

    if (validationError && !force) {
      return NextResponse.json(apiError(stripConflictMarker(validationError)), { status: 409 })
    }

    // Capacity checks (engine parity): weekly units / daily load / back-to-back
    // labs. Override-able the same way — these are judgment calls, not errors.
    if (!validationError && body.force !== true) {
      const capacityWarning = await validateEntryCapacity(id, merged, entryId)
      if (capacityWarning) {
        return NextResponse.json(
          { ...apiError(capacityWarning), overridable: true },
          { status: 409 }
        )
      }
    }

    const updated = await db.scheduleEntry.update({
      where: { id: entryId, scheduleId: id },
      data: {
        ...(body.day !== undefined ? { day: body.day } : {}),
        ...(body.startTime !== undefined ? { startTime: body.startTime } : {}),
        ...(body.endTime !== undefined ? { endTime: body.endTime } : {}),
        ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
        ...(body.facultyId !== undefined ? { facultyId: body.facultyId } : {}),
        ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
        ...(body.subjectId !== undefined ? { subjectId: body.subjectId } : {}),
        ...(body.set !== undefined ? { set: body.set } : {}),
      },
      include: {
        subject: true,
        faculty: { include: { user: true } },
        room: true,
        section: true,
      },
    })

    // Sync specializations for both old and new faculty when faculty changes
    const affectedFacultyIds = new Set<string>()
    if (entry.facultyId) affectedFacultyIds.add(entry.facultyId)
    if (body.facultyId && body.facultyId !== entry.facultyId) affectedFacultyIds.add(body.facultyId)
    await Promise.all([...affectedFacultyIds].map(fid => syncFacultySpecializations(fid).catch(() => {})))

    const responsePayload = apiResponse(updated)
    if (validationError) {
      return NextResponse.json({ ...responsePayload, warning: validationError })
    }
    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error("PATCH /api/schedules/[id]/entries/[entryId] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser) {
      return NextResponse.json(apiError("User not found"), { status: 404 })
    }

    const { id, entryId } = await params

    const schedule = await db.schedule.findUnique({ where: { id } })
    if (!schedule) {
      return NextResponse.json(apiError("Schedule not found"), { status: 400 })
    }

    const entry = await db.scheduleEntry.findUnique({ where: { id: entryId } })
    if (!entry) {
      return NextResponse.json(apiError("Entry not found"), { status: 404 })
    }

    // Permission rules (two-phase workflow):
    // - SUPER_ADMIN: delete on any status — for GEC/PATHFIT conflict resolution.
    // - ADMIN: delete own entries on DRAFT only.
    if (dbUser.role === "SUPER_ADMIN") {
      // Any status — subject ownership checked below
    } else if (dbUser.role === "ADMIN" && schedule.status === "DRAFT") {
      // OK — subject ownership checked below
    } else {
      return NextResponse.json(apiError("You don't have permission to modify this schedule"), { status: 403 })
    }

    // Subject ownership: a cluster chair can only delete entries for their own
    // cluster's GEC codes/majors; a Program Chair only their own program's subjects.
    const permError = await checkSubjectEditPermission(dbUser, entry.subjectId)
    if (permError) {
      return NextResponse.json(apiError(permError), { status: 403 })
    }

    await db.scheduleEntry.delete({ where: { id: entryId, scheduleId: id } })

    // Re-sync the faculty's specializations now that one entry is removed
    if (entry.facultyId) {
      await syncFacultySpecializations(entry.facultyId).catch(() => {})
    }

    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error) {
    console.error("DELETE /api/schedules/[id]/entries/[entryId] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
