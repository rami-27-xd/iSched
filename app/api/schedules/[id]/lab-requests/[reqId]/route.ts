import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { createNotification } from "@/lib/notifications"

/**
 * PATCH /api/schedules/[id]/lab-requests/[reqId]
 *
 * Resolve a lab-change request (spec Section 2):
 *   - action "resolve" / "deny": the addressed CIT Program Chair (or any CIT chair
 *     if the program has no head) marks it done / declined after acting on the lab.
 *   - action "cancel": the requesting Dept Chair withdraws it.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Unauthorized"), { status: 403 })
    }

    const { reqId } = await params
    const body = await req.json()
    const { action, note } = body as { action?: "resolve" | "deny" | "cancel"; note?: string }

    if (!action || !["resolve", "deny", "cancel"].includes(action)) {
      return NextResponse.json(apiError("Invalid action"), { status: 400 })
    }

    const request = await db.scheduleSwapRequest.findUnique({ where: { id: reqId } })
    if (!request || request.kind !== "LAB_CHANGE") {
      return NextResponse.json(apiError("Request not found"), { status: 404 })
    }
    if (request.status !== "PENDING") {
      return NextResponse.json(apiError("This request has already been closed"), { status: 409 })
    }

    // Authorization: cancel is the requester's (DC); resolve/deny is the CIT chair's.
    if (action === "cancel") {
      if (request.requesterId !== dbUser.id) {
        return NextResponse.json(apiError("Only the requester can cancel this request"), { status: 403 })
      }
    } else {
      const isTarget = request.targetUserId === dbUser.id
      // If no specific chair was set, any CIT Program Chair may resolve it.
      const isCitChair =
        !request.targetUserId &&
        dbUser.role === "ADMIN" &&
        (dbUser as any).programHead?.program?.department?.college?.abbreviation === "CIT"
      if (!isTarget && !isCitChair) {
        return NextResponse.json(apiError("Only the addressed CIT Program Chair can respond to this request"), { status: 403 })
      }
    }

    const newStatus = action === "resolve" ? "RESOLVED" : action === "deny" ? "DENIED" : "CANCELLED"

    const updated = await db.scheduleSwapRequest.update({
      where: { id: reqId },
      data: {
        status: newStatus,
        respondedBy: dbUser.id,
        respondedAt: new Date(),
        responseNote: note?.trim() || null,
      },
    })

    // Notify the other party.
    const actorName = `${dbUser.firstName} ${dbUser.lastName}`.trim()
    if (action === "cancel") {
      if (request.targetUserId) {
        await createNotification({
          userId: request.targetUserId,
          title: "Lab change request withdrawn",
          message: `${actorName} withdrew their request to move a CIT lab.`,
          type: "lab_change_updated",
          link: "/dashboard/schedules",
        }).catch(() => {})
      }
    } else {
      const verb = action === "resolve" ? "resolved" : "declined"
      await createNotification({
        userId: request.requesterId,
        title: `Lab change request ${verb}`,
        message: `${actorName} ${verb} your CIT lab-change request.${note?.trim() ? ` Note: ${note.trim()}` : ""}`,
        type: "lab_change_updated",
        link: "/dashboard/schedules",
      }).catch(() => {})
    }

    return NextResponse.json(apiResponse(updated))
  } catch (error) {
    console.error("PATCH /api/schedules/[id]/lab-requests/[reqId] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
