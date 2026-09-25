import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { validateEntry, validateEntryCapacity, stripConflictMarker, isHardConflict, roomBuildingOpenToDepartment } from "@/lib/services/entry-validation"
import { isGecFinalized, GEC_FIRST_MESSAGE, reopenGecIfStale, reopenProgramIfStale } from "@/lib/services/workflow-gates"
import { syncFacultySpecializations } from "@/lib/services/sync-specializations"
import { checkSubjectEditPermission } from "@/lib/services/subject-permissions"
import { isGeUnitRole, isNstpCode } from "@/lib/roles"
import { recordAudit } from "@/lib/audit"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser) return NextResponse.json(apiError("User not found"), { status: 404 })

    const { id } = await params
    const body = await req.json()

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: { department: true },
    })
    if (!schedule) return NextResponse.json(apiError("Schedule not found"), { status: 404 })

    // SUPER_ADMIN (Dept Chair): can add entries at DRAFT, PENDING_APPROVAL, or PUBLISHED.
    //   DRAFT            — initial data entry before Program Chairs submit
    //   PENDING_APPROVAL — adding GEC/PATHFIT on top of Program Chairs' submitted entries
    //   PUBLISHED        — adding GEC/PATHFIT after the schedule is already live
    // PATHFIT / NSTP coordinators: same window as the Dept Chair — their classes sit on
    //   top of every department's schedule, whatever stage it is at (subject
    //   ownership below restricts them to their own codes).
    // ADMIN (Program Chair): can add entries on DRAFT only (their window is before submission).
    // DEAN: never — read-only.
    const anyStage = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED"].includes(schedule.status as string)
    const canAdd =
      ((dbUser.role === "SUPER_ADMIN" || isGeUnitRole(dbUser.role)) && anyStage) ||
      (dbUser.role === "ADMIN" && schedule.status === "DRAFT")

    if (!canAdd) {
      return NextResponse.json(
        apiError("You don't have permission to add entries to this schedule"),
        { status: 403 }
      )
    }

    // ── Subject ownership check ────────────────────────────────────────────
    // CAS cluster chairs may only place their own cluster's GEC codes/majors;
    // Program Chairs may only place their own program's subjects — never GEC.
    if (body.subjectId) {
      const permError = await checkSubjectEditPermission(dbUser, body.subjectId)
      if (permError) {
        return NextResponse.json(apiError(permError), { status: 403 })
      }
    }

    // ── GEC-finalized gate ──────────────────────────────────────────────
    // Program Chairs add their major load only after ALL THREE CAS cluster
    // chairpersons have finalized GEC/GEL for this schedule. Before that:
    //   CIT   — may plot LABORATORY subjects only (step 1 pre-plot: labs are
    //           locked in first so GEC is scheduled around them; hard, no override).
    //   others — nothing yet; wait for the cluster chairpersons.
    if (dbUser.role === "ADMIN" && body.subjectId) {
      const gecReady = await isGecFinalized(id)
      if (!gecReady) {
        const chairCollege = (dbUser as any).programHead?.program?.department?.college?.abbreviation ?? null
        const subj = await db.subject.findUnique({
          where: { id: body.subjectId },
          select: { type: true },
        })
        const citLabPreplot = chairCollege === "CIT" && subj?.type === "LABORATORY"
        if (!citLabPreplot) {
          return NextResponse.json(
            apiError(
              chairCollege === "CIT"
                ? "CIT pre-plotting stage: only laboratory subjects may be added until the Department Chairperson has generated the GEC/GEL schedule. Lecture and other major subjects can be added once GEC is in place."
                : GEC_FIRST_MESSAGE
            ),
            { status: 409 }
          )
        }
      }
    }

    // ── Building restriction check ─────────────────────────────────────────
    // Same rule as the generator's room pool: the room's building is either
    // shared (no department links) or linked to this schedule's department.
    if (body.roomId && schedule.departmentId) {
      const access = await roomBuildingOpenToDepartment(body.roomId, schedule.departmentId)
      if (!access.ok) {
        return NextResponse.json(
          apiError(`Room "${access.roomCode}" is in a building reserved for other departments. Choose a room from a shared building or one assigned to this department.`),
          { status: 409 }
        )
      }
    }

    // ── Day pattern (MWF / TTh / custom multi-day, or a single day) ────────
    // `days` (plural) lets the chair place one class across several days in
    // one action — the same session time on each day, grouped so the list/
    // calendar views collapse them and delete removes the whole set together
    // (mirrors how auto-generated multi-day assignments already work).
    // `day` (singular) is kept for backward compatibility (single-session entry).
    const days: string[] = Array.isArray(body.days) && body.days.length > 0
      ? body.days
      : (body.day ? [body.day] : [])
    if (days.length === 0) {
      return NextResponse.json(apiError("Select at least one day"), { status: 400 })
    }

    // ── Merged NSTP sections ──────────────────────────────────────────────
    // `sectionIds` (plural) holds one NSTP class for two or more sections at
    // once — the same faculty, room, day(s) and time, stored as one row per
    // (section, day) sharing a mergeGroupId. Only NSTP may be merged (an NSTP
    // class routinely combines sections); every other subject keeps one
    // section per class. `sectionId` (singular) is the ordinary path.
    const rawSectionIds: string[] = Array.isArray(body.sectionIds) && body.sectionIds.length > 0
      ? body.sectionIds
      : (body.sectionId ? [body.sectionId] : [])
    const sectionIds = [...new Set(rawSectionIds.filter((x: unknown): x is string => typeof x === "string" && !!x))]
    if (sectionIds.length === 0) {
      return NextResponse.json(apiError("Select a section"), { status: 400 })
    }
    const isMerged = sectionIds.length > 1
    if (isMerged) {
      const subj = await db.subject.findUnique({ where: { id: body.subjectId }, select: { code: true } })
      if (!isNstpCode(subj?.code)) {
        return NextResponse.json(
          apiError("Only NSTP classes can be merged across sections — every other subject is scheduled one section at a time."),
          { status: 400 }
        )
      }
    }
    const mergeGroupId = isMerged ? crypto.randomUUID() : null

    // ── Validate scheduling constraints (conflicts) — every day must pass. ──
    // All-or-nothing: if any day in the pattern conflicts, none are created,
    // so a chair never ends up with a class half-placed across the week. For a
    // merged class every section is checked too (each section's own timetable
    // must be free) — the sibling rows share the merge group, so they are not
    // a faculty/room clash with each other.
    // force: true = soft-validation — save anyway and return a warning instead of
    // blocking, same rule PATCH /entries/[entryId] uses. Never overridable even
    // with force: the Saturday restriction, faculty/room double-booking and the
    // per-day session cap (Saturday text-matched; the other two [HARD]-marked —
    // see isHardConflict). A specialization mismatch is the common case this
    // unlocks: allowed manually with a warning, never on auto-generation.
    let overriddenWarning: string | null = null
    for (const day of days) {
      for (const sectionId of sectionIds) {
        const validationError = await validateEntry(id, {
          subjectId: body.subjectId,
          facultyId: body.facultyId,
          roomId: body.roomId,
          sectionId,
          day,
          startTime: body.startTime,
          endTime: body.endTime,
          set: body.set ?? null,
          mergeGroupId,
        })
        if (!validationError) continue
        const forceable =
          body.force === true &&
          !validationError.includes("Saturday classes are reserved") &&
          !isHardConflict(validationError)
        if (!forceable) {
          return NextResponse.json(apiError(stripConflictMarker(validationError)), { status: 409 })
        }
        overriddenWarning = stripConflictMarker(validationError)
      }
    }

    // ── Capacity checks (engine parity, override-able) ──────────────────────
    // maxWeeklyUnits / maxDailyLoad / no back-to-back labs. These are judgment
    // calls rather than correctness errors, so a chair can proceed deliberately
    // with `force: true`; the response still reports what was overridden.
    // A merged class is ONE teaching block however many sections sit in it, so
    // the check runs once per day, for the first section.
    let capacityWarning: string | null = null
    if (!body.force) {
      for (const day of days) {
        capacityWarning = await validateEntryCapacity(id, {
          subjectId: body.subjectId,
          facultyId: body.facultyId,
          roomId: body.roomId,
          sectionId: sectionIds[0],
          day,
          startTime: body.startTime,
          endTime: body.endTime,
          set: body.set ?? null,
          mergeGroupId,
        })
        if (capacityWarning) {
          return NextResponse.json(
            { ...apiError(capacityWarning), overridable: true },
            { status: 409 }
          )
        }
      }
    }

    // ── Persist ────────────────────────────────────────────────────────────
    // One row per (day × section). Multi-day rows share a groupId; merged
    // sections share a mergeGroupId (both, for a merged multi-day class).
    const groupId = days.length > 1 ? crypto.randomUUID() : null
    const createdEntries = await db.$transaction(
      days.flatMap((day) =>
        sectionIds.map((sectionId) =>
          db.scheduleEntry.create({
            data: {
              scheduleId: id,
              subjectId: body.subjectId,
              facultyId: body.facultyId,
              // Store the free-text faculty name override when provided
              facultyName: body.facultyName?.trim() || null,
              roomId: body.roomId,
              sectionId,
              day: day as any, // DayOfWeek — days[] is validated against the same enum values as the single-day `day` field
              startTime: body.startTime,
              endTime: body.endTime,
              set: body.set ?? null,
              groupId,
              mergeGroupId,
              createdBy: dbUser.id,
            },
            include: {
              subject: true,
              faculty: { include: { user: true } },
              room: { include: { building: true } },
              section: true,
            },
          })
        )
      )
    )
    const entry = createdEntries[0]
    const sectionNames = [...new Set(createdEntries.map((e) => e.section?.name).filter(Boolean))] as string[]

    // Auto-clear any unassigned queue entry for this subject+section pair
    await db.unassignedEntry.deleteMany({
      where: { scheduleId: id, subjectId: body.subjectId, sectionId: { in: sectionIds } },
    })

    // Keep faculty specializations in sync with their actual assignments
    if (body.facultyId) {
      await syncFacultySpecializations(body.facultyId).catch(() => {})
    }
    await reopenGecIfStale(id, entry.subject?.code, dbUser)
    await reopenProgramIfStale(id, dbUser)

    await recordAudit({
      actor: dbUser as any,
      action: "entry.created",
      entityType: "entry",
      entityId: entry.id,
      departmentId: schedule.departmentId,
      scheduleId: id,
      summary: `Added ${entry.subject?.code ?? "class"} for ${sectionNames.join(" + ") || entry.section?.name || "section"}${isMerged ? " (merged)" : ""} — ${days.join("/")} ${body.startTime}–${body.endTime}${entry.room ? ` in ${entry.room.code}` : ""}`,
      metadata: {
        Subject: `${entry.subject?.code ?? ""} — ${entry.subject?.title ?? ""}`.trim(),
        Section: sectionNames.join(", ") || (entry.section?.name ?? ""),
        ...(isMerged ? { "Merged sections": String(sectionIds.length) } : {}),
        Faculty: entry.facultyName ?? (entry.faculty?.user ? `${entry.faculty.user.firstName} ${entry.faculty.user.lastName}` : ""),
        Room: entry.room ? `${entry.room.code}${entry.room.building ? ` (${entry.room.building.name})` : ""}` : "",
        Days: days.join(", "),
        Time: `${body.startTime}–${body.endTime}`,
        ...(body.set ? { Set: body.set } : {}),
        ...(overriddenWarning ? { "Warning overridden": overriddenWarning } : body.force ? { "Capacity warning overridden": "yes" } : {}),
      },
    })

    const responsePayload = apiResponse(createdEntries.length > 1 ? createdEntries : entry)
    return NextResponse.json(
      overriddenWarning ? { ...responsePayload, warning: overriddenWarning } : responsePayload,
      { status: 201 }
    )
  } catch (error) {
    console.error("POST /api/schedules/[id]/entries error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
