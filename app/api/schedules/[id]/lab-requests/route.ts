import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { createNotification } from "@/lib/notifications"

/**
 * Lab-change requests (spec Section 2).
 *
 * When the Department Chairperson's GEC cannot be placed around a CIT laboratory,
 * they cannot edit the lab themselves — only the owning CIT Program Chairperson may.
 * This route lets the DC formally REQUEST that chair to move the lab, tracked on the
 * ScheduleSwapRequest model (kind = "LAB_CHANGE") and delivered via a notification.
 */

// GET — list this schedule's lab-change requests. For the DC it also returns the
// CIT laboratory entries they can raise a request against.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Unauthorized"), { status: 403 })
    }

    const { id } = await params
    const isSuperAdmin = dbUser.role === "SUPER_ADMIN"

    const requests = await db.scheduleSwapRequest.findMany({
      where: {
        scheduleId: id,
        kind: "LAB_CHANGE",
        // A Program Chair only sees requests addressed to them.
        ...(isSuperAdmin ? {} : { targetUserId: dbUser.id }),
      },
      orderBy: { createdAt: "desc" },
    })

    // Hydrate the entries the requests reference.
    const entryIds = [...new Set(requests.map((r) => r.entryId))]
    const reqEntries = entryIds.length
      ? await db.scheduleEntry.findMany({
          where: { id: { in: entryIds } },
          select: {
            id: true,
            day: true,
            startTime: true,
            endTime: true,
            set: true,
            subject: { select: { code: true, title: true } },
            section: { select: { name: true } },
            room: { select: { code: true } },
          },
        })
      : []
    const entryMap = new Map(reqEntries.map((e) => [e.id, e]))

    const userIds = [...new Set(requests.flatMap((r) => [r.requesterId, r.targetUserId].filter(Boolean) as string[]))]
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : []
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))

    const shapedRequests = requests.map((r) => {
      const e = entryMap.get(r.entryId)
      return {
        id: r.id,
        status: r.status,
        reason: r.reason,
        responseNote: r.responseNote,
        createdAt: r.createdAt,
        requesterName: userMap.get(r.requesterId) ?? "Dept Chairperson",
        targetName: r.targetUserId ? userMap.get(r.targetUserId) ?? "CIT Chairperson" : "Unassigned CIT chair",
        entry: e
          ? {
              subjectCode: e.subject?.code,
              subjectTitle: e.subject?.title,
              sectionName: e.section?.name,
              roomCode: e.room?.code,
              day: e.day,
              startTime: e.startTime,
              endTime: e.endTime,
              set: e.set,
            }
          : null,
      }
    })

    // For the DC: the CIT lab entries in this schedule available to request a change on.
    let citLabEntries: any[] = []
    if (isSuperAdmin) {
      const labs = await db.scheduleEntry.findMany({
        where: {
          scheduleId: id,
          subject: {
            type: "LABORATORY",
            program: { department: { college: { abbreviation: "CIT" } } },
          },
        },
        select: {
          id: true,
          day: true,
          startTime: true,
          endTime: true,
          set: true,
          subject: {
            select: {
              code: true,
              title: true,
              program: {
                select: {
                  abbreviation: true,
                  head: { select: { user: { select: { firstName: true, lastName: true } } } },
                },
              },
            },
          },
          section: { select: { name: true } },
          room: { select: { code: true } },
        },
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
      })
      const pendingByEntry = new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.entryId))
      citLabEntries = labs.map((e) => ({
        id: e.id,
        subjectCode: e.subject?.code,
        subjectTitle: e.subject?.title,
        programAbbr: e.subject?.program?.abbreviation,
        chairName: e.subject?.program?.head?.user
          ? `${e.subject.program.head.user.firstName} ${e.subject.program.head.user.lastName}`.trim()
          : null,
        sectionName: e.section?.name,
        roomCode: e.room?.code,
        day: e.day,
        startTime: e.startTime,
        endTime: e.endTime,
        set: e.set,
        hasPendingRequest: pendingByEntry.has(e.id),
      }))
    }

    return NextResponse.json(apiResponse({ requests: shapedRequests, citLabEntries }))
  } catch (error) {
    console.error("GET /api/schedules/[id]/lab-requests error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

// POST — the Dept Chair raises a lab-change request for a CIT laboratory entry.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        apiError("Only the Department Chairperson can request a CIT lab change"),
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const { entryId, reason } = body as { entryId?: string; reason?: string }

    if (!entryId || !reason?.trim()) {
      return NextResponse.json(apiError("An entry and a reason are required"), { status: 400 })
    }

    const entry = await db.scheduleEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        scheduleId: true,
        roomId: true,
        day: true,
        startTime: true,
        endTime: true,
        subject: {
          select: {
            code: true,
            type: true,
            program: {
              select: {
                abbreviation: true,
                department: { select: { college: { select: { abbreviation: true } } } },
                head: { select: { userId: true } },
              },
            },
          },
        },
      },
    })

    if (!entry || entry.scheduleId !== id) {
      return NextResponse.json(apiError("Entry not found in this schedule"), { status: 404 })
    }

    const isCitLab =
      entry.subject?.type === "LABORATORY" &&
      entry.subject?.program?.department?.college?.abbreviation === "CIT"
    if (!isCitLab) {
      return NextResponse.json(
        apiError("Lab-change requests apply only to CIT laboratory subjects."),
        { status: 400 }
      )
    }

    // One open request per entry.
    const existing = await db.scheduleSwapRequest.findFirst({
      where: { entryId, kind: "LAB_CHANGE", status: "PENDING" },
    })
    if (existing) {
      return NextResponse.json(
        apiError("There is already a pending request for this lab entry."),
        { status: 409 }
      )
    }

    const targetUserId = entry.subject?.program?.head?.userId ?? null

    const request = await db.scheduleSwapRequest.create({
      data: {
        requesterId: dbUser.id,
        entryId,
        // Store the CURRENT slot as reference — the CIT chair is being asked to change it.
        requestedRoomId: entry.roomId,
        requestedDay: entry.day,
        requestedStart: entry.startTime,
        requestedEnd: entry.endTime,
        reason: reason.trim(),
        kind: "LAB_CHANGE",
        scheduleId: id,
        targetUserId,
      },
    })

    // Notify the owning CIT Program Chair (or every CIT chair if the program has none).
    const chairName = `${dbUser.firstName} ${dbUser.lastName}`.trim()
    const msg = `${chairName} asked you to move CIT lab "${entry.subject?.code}" (${entry.day} ${entry.startTime}-${entry.endTime}) — it conflicts with a GEC/GEL subject. Reason: ${reason.trim()}`
    if (targetUserId) {
      await createNotification({
        userId: targetUserId,
        title: "Lab change requested",
        message: msg,
        type: "lab_change_requested",
        link: "/dashboard/schedules",
      }).catch(() => {})
    } else {
      const citAdmins = await db.user.findMany({
        where: {
          role: "ADMIN",
          isApproved: true,
          isActive: true,
          department: { college: { abbreviation: "CIT" } },
        },
        select: { id: true },
      })
      await Promise.all(
        citAdmins.map((a) =>
          createNotification({
            userId: a.id,
            title: "Lab change requested",
            message: msg,
            type: "lab_change_requested",
            link: "/dashboard/schedules",
          }).catch(() => {})
        )
      )
    }

    return NextResponse.json(apiResponse(request), { status: 201 })
  } catch (error) {
    console.error("POST /api/schedules/[id]/lab-requests error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
