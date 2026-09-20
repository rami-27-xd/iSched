import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { validateEntry, validateEntryCapacity, isHardConflict, stripConflictMarker, roomBuildingOpenToDepartment } from "@/lib/services/entry-validation"
import { syncFacultySpecializations } from "@/lib/services/sync-specializations"
import { checkSubjectEditPermission } from "@/lib/services/subject-permissions"
import { isGeUnitRole, isNstpCode } from "@/lib/roles"
import { reopenGecIfStale } from "@/lib/services/workflow-gates"
import { recordAudit } from "@/lib/audit"

const entryInclude = {
  subject: true,
  faculty: { include: { user: true } },
  room: true,
  section: true,
} as const

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
    // - PATHFIT / NSTP: any status — their own codes only (ownership below).
    // - DEAN: never (read-only).
    if (dbUser.role === "SUPER_ADMIN" || isGeUnitRole(dbUser.role)) {
      // Any status — but subject ownership is checked below
    } else if (dbUser.role === "ADMIN" && schedule.status === "DRAFT") {
      // Own DRAFT — subject ownership checked below
    } else {
      return NextResponse.json(apiError("You don't have permission to modify this schedule"), { status: 403 })
    }

    // Room moved to a different building? Same rule as the generator and POST:
    // the building must be shared (no department links) or linked to this department.
    if (body.roomId !== undefined && body.roomId && body.roomId !== entry.roomId && schedule.departmentId) {
      const access = await roomBuildingOpenToDepartment(body.roomId, schedule.departmentId)
      if (!access.ok) {
        return NextResponse.json(
          apiError(`Room "${access.roomCode}" is in a building reserved for other departments. Choose a room from a shared building or one assigned to this department.`),
          { status: 409 }
        )
      }
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

    // ── Merged NSTP class ───────────────────────────────────────────────────
    // A merged class is one row per (section, day) sharing a mergeGroupId. The
    // row being edited stands for its whole SESSION (every section's row on
    // that day): field changes apply to all of them, and `sectionIds` lets the
    // NSTP Director add or drop sections from the class (or merge a plain
    // single-section NSTP class with others). Rows on the class's OTHER days
    // are left alone here — only the session that was clicked moves.
    const mergeRows = entry.mergeGroupId
      ? await db.scheduleEntry.findMany({
          where: { scheduleId: id, mergeGroupId: entry.mergeGroupId },
          select: { id: true, sectionId: true, day: true, startTime: true, endTime: true, groupId: true },
        })
      : []
    const sessionRows = mergeRows.length > 0
      ? mergeRows.filter((r) => r.day === entry.day && r.startTime === entry.startTime && r.endTime === entry.endTime)
      : [{ id: entry.id, sectionId: entry.sectionId, day: entry.day, startTime: entry.startTime, endTime: entry.endTime, groupId: entry.groupId }]
    const sessionRowIds = sessionRows.map((r) => r.id)

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
      mergeGroupId: entry.mergeGroupId ?? null,
    }

    // A merged class keeps its sections through `sectionIds`; a single-section
    // change of `sectionId` only makes sense for an ordinary class.
    const sectionChangeOnMerged = mergeRows.length > 0 && body.sectionId !== undefined && body.sectionId !== entry.sectionId
    if (sectionChangeOnMerged) {
      return NextResponse.json(
        apiError("This is a merged NSTP class — change which sections it covers with the section list, not by replacing one section."),
        { status: 400 }
      )
    }

    // Validate every row of the session against everything else. The session's
    // own rows are excluded (they are what is being moved), and merged siblings
    // are exempt from faculty/room clashes with each other by mergeGroupId.
    let validationError: string | null = null
    for (const row of sessionRows) {
      validationError = await validateEntry(id, { ...merged, sectionId: mergeRows.length > 0 ? row.sectionId : merged.sectionId }, sessionRowIds)
      if (validationError) break
    }
    // force: true = soft-validation — save anyway and return warning instead of blocking.
    // Three classes of error are never overridable:
    //   1. The Saturday restriction (CAM/NSTP only) — a compliance hard constraint.
    //   2. Faculty/room double-booking (isHardConflict) — a physical impossibility,
    //      and the one that let cross-department clashes through: adding a
    //      conflicting entry was already blocked, but MOVING a clean entry onto
    //      another department's slot and force-saving was not.
    //   3. The per-day session cap (GEC/GEL 1h / 1h 30min) — also HARD-marked.
    const force =
      body.force === true &&
      !validationError?.includes("Saturday classes are reserved") &&
      !isHardConflict(validationError)

    if (validationError && !force) {
      return NextResponse.json(apiError(stripConflictMarker(validationError)), { status: 409 })
    }

    // Capacity checks (engine parity): weekly units / daily load / back-to-back
    // labs. Override-able the same way — these are judgment calls, not errors.
    // A merged class is one teaching block, so the check runs once.
    if (!validationError && body.force !== true) {
      const capacityWarning = await validateEntryCapacity(id, merged, sessionRowIds)
      if (capacityWarning) {
        return NextResponse.json(
          { ...apiError(capacityWarning), overridable: true },
          { status: 409 }
        )
      }
    }

    const fieldChanges = {
      ...(body.day !== undefined ? { day: body.day } : {}),
      ...(body.startTime !== undefined ? { startTime: body.startTime } : {}),
      ...(body.endTime !== undefined ? { endTime: body.endTime } : {}),
      ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
      ...(body.facultyId !== undefined ? { facultyId: body.facultyId } : {}),
      ...(body.subjectId !== undefined ? { subjectId: body.subjectId } : {}),
      ...(body.set !== undefined ? { set: body.set } : {}),
    }
    // Section replacement applies to an ordinary (non-merged) row only.
    const singleRowChanges = {
      ...fieldChanges,
      ...(mergeRows.length === 0 && body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
    }

    if (sessionRowIds.length > 1) {
      await db.scheduleEntry.updateMany({
        where: { id: { in: sessionRowIds }, scheduleId: id },
        data: fieldChanges,
      })
    }
    const updated = await db.scheduleEntry.update({
      where: { id: entryId, scheduleId: id },
      data: sessionRowIds.length > 1 ? fieldChanges : singleRowChanges,
      include: entryInclude,
    })

    // ── Section list (merge / unmerge) ──────────────────────────────────────
    // `sectionIds` = the full set of sections this class should now cover.
    // Sections dropped from the list lose their rows (every day); sections added
    // get a row for every session the class already meets in. Only NSTP.
    let mergeNote: string | null = null
    if (Array.isArray(body.sectionIds)) {
      const target = [...new Set((body.sectionIds as unknown[]).filter((x): x is string => typeof x === "string" && !!x))]
      if (target.length === 0) {
        return NextResponse.json(apiError("A class must keep at least one section"), { status: 400 })
      }
      const subjectCode = updated.subject?.code
      if (target.length > 1 && !isNstpCode(subjectCode)) {
        return NextResponse.json(
          apiError("Only NSTP classes can be merged across sections — every other subject is scheduled one section at a time."),
          { status: 400 }
        )
      }

      // Every row of the CLASS (all days): the merge group, else the row plus
      // its multi-day siblings.
      let mergeGroupId = updated.mergeGroupId
      if (!mergeGroupId && target.length > 1) {
        mergeGroupId = crypto.randomUUID()
        await db.scheduleEntry.updateMany({
          where: updated.groupId ? { scheduleId: id, groupId: updated.groupId } : { id: updated.id },
          data: { mergeGroupId },
        })
      }
      const classRows = await db.scheduleEntry.findMany({
        where: mergeGroupId
          ? { scheduleId: id, mergeGroupId }
          : updated.groupId
            ? { scheduleId: id, groupId: updated.groupId }
            : { id: updated.id },
        select: { id: true, sectionId: true, day: true, startTime: true, endTime: true, groupId: true },
      })
      const current = [...new Set(classRows.map((r) => r.sectionId))]
      const toAdd = target.filter((s) => !current.includes(s))
      const toRemove = current.filter((s) => !target.includes(s))

      // Distinct sessions the class meets in (day + time), after the move above.
      const sessions = [...new Map(classRows.map((r) => [`${r.day}|${r.startTime}|${r.endTime}`, r])).values()]

      // Validate every new (section × session) row before creating any — each
      // added section's timetable must be free at those times.
      for (const sectionId of toAdd) {
        for (const ses of sessions) {
          const err = await validateEntry(id, {
            subjectId: updated.subjectId,
            facultyId: updated.facultyId,
            roomId: updated.roomId,
            sectionId,
            day: ses.day,
            startTime: ses.startTime,
            endTime: ses.endTime,
            set: updated.set ?? null,
            mergeGroupId,
          })
          if (err) {
            return NextResponse.json(apiError(stripConflictMarker(err)), { status: 409 })
          }
        }
      }

      if (toRemove.length > 0) {
        await db.scheduleEntry.deleteMany({
          where: { id: { in: classRows.filter((r) => toRemove.includes(r.sectionId)).map((r) => r.id) } },
        })
      }
      if (toAdd.length > 0) {
        await db.scheduleEntry.createMany({
          data: toAdd.flatMap((sectionId) =>
            sessions.map((ses) => ({
              scheduleId: id,
              subjectId: updated.subjectId,
              facultyId: updated.facultyId,
              facultyName: updated.facultyName,
              roomId: updated.roomId,
              sectionId,
              day: ses.day,
              startTime: ses.startTime,
              endTime: ses.endTime,
              set: updated.set ?? null,
              groupId: ses.groupId,
              mergeGroupId,
              createdBy: dbUser.id,
            }))
          ),
        })
        await db.unassignedEntry.deleteMany({
          where: { scheduleId: id, subjectId: updated.subjectId, sectionId: { in: toAdd } },
        })
      }
      // Back to a single section — no longer a merged class.
      if (target.length === 1 && mergeGroupId) {
        await db.scheduleEntry.updateMany({ where: { scheduleId: id, mergeGroupId }, data: { mergeGroupId: null } })
      }
      if (toAdd.length || toRemove.length) {
        const names = await db.section.findMany({ where: { id: { in: [...toAdd, ...toRemove] } }, select: { id: true, name: true } })
        const nameOf = (sid: string) => names.find((n) => n.id === sid)?.name ?? "section"
        mergeNote = [
          ...(toAdd.length ? [`added ${toAdd.map(nameOf).join(", ")}`] : []),
          ...(toRemove.length ? [`removed ${toRemove.map(nameOf).join(", ")}`] : []),
        ].join("; ")
      }
    }

    // Sync specializations for both old and new faculty when faculty changes
    const affectedFacultyIds = new Set<string>()
    if (entry.facultyId) affectedFacultyIds.add(entry.facultyId)
    if (body.facultyId && body.facultyId !== entry.facultyId) affectedFacultyIds.add(body.facultyId)
    await Promise.all([...affectedFacultyIds].map(fid => syncFacultySpecializations(fid).catch(() => {})))

    await reopenGecIfStale(id, updated.subject?.code, dbUser)

    // Section names of the whole class, for the log line.
    const finalRows = updated.mergeGroupId || mergeRows.length
      ? await db.scheduleEntry.findMany({
          where: { scheduleId: id, mergeGroupId: updated.mergeGroupId ?? entry.mergeGroupId ?? "__none__" },
          select: { section: { select: { name: true } } },
        })
      : []
    const sectionLabel = finalRows.length
      ? [...new Set(finalRows.map((r) => r.section?.name).filter(Boolean))].join(" + ")
      : (updated.section?.name ?? "section")

    await recordAudit({
      actor: dbUser as any,
      action: "entry.updated",
      entityType: "entry",
      entityId: entryId,
      departmentId: schedule.departmentId,
      scheduleId: id,
      summary: `Edited ${updated.subject?.code ?? "class"} for ${sectionLabel} — now ${updated.day} ${updated.startTime}–${updated.endTime}${updated.room ? ` in ${updated.room.code}` : ""}${mergeNote ? ` (${mergeNote})` : ""}`,
      metadata: {
        Subject: `${updated.subject?.code ?? ""} — ${updated.subject?.title ?? ""}`.trim(),
        Section: sectionLabel,
        Faculty: updated.facultyName ?? (updated.faculty?.user ? `${updated.faculty.user.firstName} ${updated.faculty.user.lastName}` : ""),
        Room: updated.room?.code ?? "",
        Before: `${entry.day} ${entry.startTime}–${entry.endTime}`,
        After: `${updated.day} ${updated.startTime}–${updated.endTime}`,
        ...(updated.set ? { Set: updated.set } : {}),
        ...(mergeNote ? { "Merged sections": mergeNote } : {}),
      },
    })

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
    // - PATHFIT / NSTP: any status — their own codes only (ownership below).
    if (dbUser.role === "SUPER_ADMIN" || isGeUnitRole(dbUser.role)) {
      // Any status — subject ownership checked below
    } else if (dbUser.role === "ADMIN" && schedule.status === "DRAFT") {
      // OK — subject ownership checked below
    } else {
      return NextResponse.json(apiError("You don't have permission to modify this schedule"), { status: 403 })
    }

    // Subject ownership: a department head can only delete entries for their own
    // GEC codes/majors; a Program Chair only their own program's subjects.
    const permError = await checkSubjectEditPermission(dbUser, entry.subjectId)
    if (permError) {
      return NextResponse.json(apiError(permError), { status: 403 })
    }

    // Multi-day (MWF/TTh) classes are one logical entry stored as one row per day
    // sharing a groupId; a merged NSTP class is one row per section (and day)
    // sharing a mergeGroupId. The delete dialog promises "all of it goes
    // together" — remove every sibling, otherwise the leftover rows keep the
    // subject marked as already scheduled for the section and it can never be
    // re-added by hand.
    const removed = await db.scheduleEntry.findUniqueOrThrow({
      where: { id: entryId, scheduleId: id },
      include: { subject: { select: { code: true } }, section: { select: { name: true } } },
    })
    const removedSections = removed.mergeGroupId
      ? await db.scheduleEntry.findMany({
          where: { scheduleId: id, mergeGroupId: removed.mergeGroupId },
          select: { section: { select: { name: true } } },
        })
      : []
    const removedRows = removed.mergeGroupId
      ? await db.scheduleEntry.deleteMany({ where: { scheduleId: id, mergeGroupId: removed.mergeGroupId } })
      : removed.groupId
        ? await db.scheduleEntry.deleteMany({ where: { scheduleId: id, groupId: removed.groupId } })
        : await db.scheduleEntry.deleteMany({ where: { id: entryId, scheduleId: id } })

    // Re-sync the faculty's specializations now that one entry is removed
    if (entry.facultyId) {
      await syncFacultySpecializations(entry.facultyId).catch(() => {})
    }

    await reopenGecIfStale(id, removed.subject?.code, dbUser)

    const sectionLabel = removedSections.length
      ? [...new Set(removedSections.map((r) => r.section?.name).filter(Boolean))].join(" + ")
      : (removed.section?.name ?? "section")

    await recordAudit({
      actor: dbUser as any,
      action: "entry.deleted",
      entityType: "entry",
      entityId: entryId,
      departmentId: schedule.departmentId,
      scheduleId: id,
      summary: `Removed ${removed.subject?.code ?? "class"} for ${sectionLabel}${removed.mergeGroupId ? " (merged)" : ""} (${removed.day} ${removed.startTime}–${removed.endTime}${removedRows.count > 1 ? ` and ${removedRows.count - 1} more row${removedRows.count > 2 ? "s" : ""}` : ""})`,
      metadata: {
        Subject: removed.subject?.code ?? "",
        Section: sectionLabel,
        Day: removed.day,
        Time: `${removed.startTime}–${removed.endTime}`,
        "Rows removed": removedRows.count,
        ...(removed.set ? { Set: removed.set } : {}),
      },
    })

    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error) {
    console.error("DELETE /api/schedules/[id]/entries/[entryId] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
