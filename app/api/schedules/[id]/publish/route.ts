import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { detectTermConflicts } from "@/lib/services/term-conflicts"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { notifyAllSuperAdmins, notifyDepartmentChairs } from "@/lib/notifications"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Only Department Chairs and Program Chairs can publish schedules"), { status: 403 })
    }

    const { id } = await params

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: {
        semester: { include: { academicYear: true } },
        department: true,
        entries: {
          include: {
            subject: true,
            faculty: { include: { user: true } },
            room: true,
            section: true,
          },
        },
      },
    })

    if (!schedule) {
      return NextResponse.json(apiError("Schedule not found"), { status: 404 })
    }

    // ADMIN (Program Chair) can only notify on an already-PUBLISHED schedule
    // SUPER_ADMIN (Dept Chair) can publish from DRAFT or PENDING_APPROVAL
    if (dbUser.role === "ADMIN") {
      if (schedule.status !== "PUBLISHED") {
        return NextResponse.json(apiError("Program Chairs can only notify faculty on published schedules"), { status: 400 })
      }
    } else {
      if (schedule.status !== "DRAFT" && schedule.status !== "PENDING_APPROVAL") {
        return NextResponse.json(apiError("Schedule must be in DRAFT or PENDING_APPROVAL status"), { status: 400 })
      }
    }

    if (schedule.entries.length === 0) {
      return NextResponse.json(apiError("Cannot publish a schedule with no entries"), { status: 400 })
    }

    // Block publish if any entry has an inactive faculty
    const inactiveEntries = schedule.entries.filter((e: any) =>
      e.faculty?.isActive === false || e.faculty?.user?.isActive === false
    )
    if (inactiveEntries.length > 0) {
      const names = inactiveEntries.map((e: any) =>
        `${e.faculty?.user?.firstName ?? ""} ${e.faculty?.user?.lastName ?? ""}`.trim()
      )
      const unique = [...new Set(names)].join(", ")
      return NextResponse.json(
        apiError(`Cannot publish: inactive faculty assigned to entries — ${unique}. Remove or replace these entries first.`),
        { status: 422 }
      )
    }

    // ADMIN (Program Chair): skip conflict detection, just notify faculty of their added entries
    if (dbUser.role === "ADMIN") {
      // Notify faculty who have entries created by this program chair
      const affectedFacultyIds = new Set(
        schedule.entries
          .filter((e: any) => e.createdBy === dbUser.id)
          .map((e: any) => e.facultyId)
      )
      for (const facultyId of affectedFacultyIds) {
        const facultyRecord = await db.faculty.findUnique({
          where: { id: facultyId },
          select: { userId: true },
        })
        if (facultyRecord?.userId) {
          await db.notification.create({
            data: {
              userId: facultyRecord.userId,
              title: "Schedule Updated",
              message: `Your schedule for ${schedule.semester?.type === "FIRST" ? "1st" : schedule.semester?.type === "SECOND" ? "2nd" : "Summer"} Semester ${schedule.semester?.academicYear?.label ?? ""} has been updated by the Program Chair.`,
              type: "schedule_published",
              link: "/dashboard",
            },
          })
        }
      }
      return NextResponse.json(apiResponse({ published: true, notified: affectedFacultyIds.size }))
    }

    // Run conflict detection across the WHOLE semester, not just this schedule.
    // This is the last gate before a schedule goes live, and departments share rooms
    // and faculty within a term — a check scoped to one schedule would let two
    // departments each publish a booking for the same room or lecturer.
    //
    // It also replaces a hand-rolled mapping that omitted `set`, which made every
    // legitimate lab Set A / Set B pair look like a section double-booking and
    // blocked publishing on it.
    const { conflicts, conflictingDepartments } = await detectTermConflicts(id)

    const errorConflicts = conflicts.filter((c: any) => c.severity === 'ERROR')
    const warningConflicts = conflicts.filter((c: any) => c.severity === 'WARNING')

    // A cross-department conflict is owned by BOTH sides — they share the room or
    // the lecturer, so neither department can resolve it alone. Tell the other
    // department's chairs as well as this one's, and log the conflict against their
    // schedule too so it shows up in their own Conflicts panel rather than only
    // appearing the next time they happen to validate.
    const crossDepartmentConflicts = conflicts.filter((c) => c.crossDepartment)
    if (crossDepartmentConflicts.length > 0) {
      const semesterLabel = `${schedule.semester?.type === "FIRST" ? "1st" : schedule.semester?.type === "SECOND" ? "2nd" : "Summer"} Semester ${schedule.semester?.academicYear?.label ?? ""}`.trim()
      const ownDept = schedule.department?.abbreviation ?? schedule.department?.name ?? "another department"

      for (const other of conflictingDepartments) {
        await db.conflictLog.deleteMany({
          where: { scheduleId: other.scheduleId, type: { startsWith: "CROSS_DEPT_" } },
        })
        await db.conflictLog.createMany({
          data: crossDepartmentConflicts.map((c) => ({
            scheduleId: other.scheduleId,
            type: `CROSS_DEPT_${c.type}`,
            description: c.description,
            entityIds: c.entryIds ?? [],
          })),
        })

        await notifyDepartmentChairs(other.departmentId, {
          title: "Cross-Department Scheduling Conflict",
          message:
            `${other.conflictCount} conflict${other.conflictCount > 1 ? "s" : ""} detected between your ${semesterLabel} schedule and ${ownDept}'s. ` +
            `Rooms and faculty are shared across departments within a term, so this needs to be resolved with them before either schedule can be published.`,
          type: "conflict_detected",
          link: "/dashboard/schedules",
        }, { excludeUserId: dbUser.id })
      }

      // ...and this department's own chairs, minus whoever pressed Publish (they
      // already get the blocking response below).
      if (schedule.departmentId) {
        const others = conflictingDepartments.map((d) => d.departmentAbbr).join(", ") || "another department"
        await notifyDepartmentChairs(schedule.departmentId, {
          title: "Cross-Department Scheduling Conflict",
          message:
            `${crossDepartmentConflicts.length} conflict${crossDepartmentConflicts.length > 1 ? "s" : ""} detected between this department's ${semesterLabel} schedule and ${others}. ` +
            `Publishing is blocked until the shared room or faculty assignment is resolved with them.`,
          type: "conflict_detected",
          link: "/dashboard/schedules",
        }, { excludeUserId: dbUser.id })
      }
    }

    // Block publish if there are ERROR-level conflicts
    if (errorConflicts.length > 0) {
      await db.conflictLog.deleteMany({ where: { scheduleId: id } })
      await db.conflictLog.createMany({
        data: conflicts.map((c: any) => ({
          scheduleId: id,
          type: c.type,
          description: c.description,
          // Conflict exposes `entryIds`; this read `c.entityIds`, which is always
          // undefined — so every logged conflict was stored with an empty id list and
          // the calendar could never highlight the entries it referred to.
          entityIds: c.entryIds ?? [],
        })),
      })

      return NextResponse.json(
        apiResponse({
          published: false,
          errors: errorConflicts,
          warnings: warningConflicts,
        }),
        { status: 422 }
      )
    }

    // Publish the schedule
    const updated = await db.schedule.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    })

    // Notify all super admins in same department
    await notifyAllSuperAdmins(
      "Schedule Published",
      `A schedule for ${schedule.semester?.type === "FIRST" ? "1st" : schedule.semester?.type === "SECOND" ? "2nd" : "Summer"} Semester ${schedule.semester?.academicYear?.label ?? ""} has been published.`,
      "schedule_published",
      "/dashboard/schedules"
    )

    // Notify all Program Chairs in the same department
    if (schedule.departmentId) {
      // Find all programs in this department
      const programs = await db.program.findMany({
        where: { departmentId: schedule.departmentId },
        include: { head: { include: { user: true } } },
      })

      // Notify each Program Chair
      for (const program of programs) {
        if (program.head?.userId) {
          await db.notification.create({
            data: {
              userId: program.head.userId,
              title: "Schedule Published — Ready for Review",
              message: `The Department Chair has published the ${schedule.semester?.type === "FIRST" ? "1st" : schedule.semester?.type === "SECOND" ? "2nd" : "Summer"} Semester ${schedule.semester?.academicYear?.label ?? ""} schedule for ${schedule.department?.name ?? "your department"}. You can now view and edit it.`,
              type: "schedule_published",
              link: "/dashboard/schedules",
            },
          })
        }
      }
    }

    // Clear old conflicts and save warnings
    await db.conflictLog.deleteMany({ where: { scheduleId: id } })
    if (warningConflicts.length > 0) {
      await db.conflictLog.createMany({
        data: warningConflicts.map((c: any) => ({
          scheduleId: id,
          type: c.type,
          description: c.description,
          // Conflict exposes `entryIds`; this read `c.entityIds`, which is always
          // undefined — so every logged conflict was stored with an empty id list and
          // the calendar could never highlight the entries it referred to.
          entityIds: c.entryIds ?? [],
        })),
      })
    }

    return NextResponse.json(
      apiResponse({
        published: true,
        schedule: updated,
        warnings: warningConflicts,
      })
    )
  } catch (error) {
    console.error("POST /api/schedules/[id]/publish error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
