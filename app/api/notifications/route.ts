import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    if (!dbUser) {
      return NextResponse.json(apiError("User not found"), { status: 404 })
    }

    const notifications = await db.notification.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    const unreadCount = await db.notification.count({
      where: { userId: dbUser.id, read: false },
    })

    return NextResponse.json(apiResponse({ notifications, unreadCount }))
  } catch (error) {
    console.error("GET /api/notifications error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const body = await req.json()
    const { userId, title, message, type, link } = body

    if (!userId || !title || !message || !type) {
      return NextResponse.json(apiError("Missing required fields"), { status: 400 })
    }

    const notification = await db.notification.create({
      data: { userId, title, message, type, link },
    })

    return NextResponse.json(apiResponse(notification), { status: 201 })
  } catch (error) {
    console.error("POST /api/notifications error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
