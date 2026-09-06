import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function PATCH(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser) {
      return NextResponse.json(apiError("User not found"), { status: 404 })
    }

    const body = await req.json()
    const { notificationId, markAll } = body

    if (markAll) {
      await db.notification.updateMany({
        where: { userId: dbUser.id, read: false },
        data: { read: true },
      })
    } else if (notificationId) {
      await db.notification.update({
        where: { id: notificationId },
        data: { read: true },
      })
    }

    return NextResponse.json(apiResponse({ success: true }))
  } catch (error) {
    console.error("PATCH /api/notifications/read error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
