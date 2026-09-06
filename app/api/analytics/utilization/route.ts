import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const scheduleId = searchParams.get("scheduleId")

    if (!scheduleId) {
      return NextResponse.json(apiError("scheduleId is required"), { status: 400 })
    }

    // Get all rooms
    const rooms = await db.room.findMany({
      where: { isActive: true },
      include: {
        scheduleEntries: {
          where: { scheduleId },
        },
      },
    })

    // Total available slots: 5 days x 13 hours (7-20) = 65 hours per room
    const totalSlotsPerRoom = 5 * 13

    const utilization = rooms.map((room: any) => {
      const bookedHours = room.scheduleEntries.reduce((sum: number, entry: any) => {
        const [sh, sm] = entry.startTime.split(":").map(Number)
        const [eh, em] = entry.endTime.split(":").map(Number)
        return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60
      }, 0)

      return {
        roomId: room.id,
        roomCode: room.code,
        roomName: room.name,
        type: room.type,
        capacity: room.capacity,
        bookedHours,
        totalHours: totalSlotsPerRoom,
        utilization: Math.round((bookedHours / totalSlotsPerRoom) * 100),
      }
    })

    const avgUtilization =
      utilization.length > 0
        ? Math.round(
            utilization.reduce((sum: number, r: any) => sum + r.utilization, 0) / utilization.length
          )
        : 0

    return NextResponse.json(
      apiResponse({
        rooms: utilization,
        averageUtilization: avgUtilization,
      })
    )
  } catch (error) {
    console.error("GET /api/analytics/utilization error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
