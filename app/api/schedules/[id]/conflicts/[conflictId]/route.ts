import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

/**
 * PATCH /api/schedules/[id]/conflicts/[conflictId] — { resolved: boolean }
 * Marks one logged conflict resolved (or open again) from the Conflicts panel.
 * Chairs and the PATHFit / NSTP Directors only; a Program Chairperson only for
 * their own department's schedule. The Dean is read-only.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; conflictId: string }> }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN", "PATHFIT", "NSTP"].includes(dbUser.role)) {
      return NextResponse.json(apiError("You don't have permission to resolve conflicts"), { status: 403 })
    }

    const { id, conflictId } = await params
    const body = await req.json().catch(() => ({}))
    const resolved = body.resolved !== false

    const conflict = await db.conflictLog.findFirst({
      where: { id: conflictId, scheduleId: id },
      include: { schedule: { select: { departmentId: true } } },
    })
    if (!conflict) return NextResponse.json(apiError("Conflict not found"), { status: 404 })

    if (dbUser.role === "ADMIN" && conflict.schedule.departmentId !== getUserDepartmentId(dbUser)) {
      return NextResponse.json(apiError("You can only resolve conflicts in your own department's schedule"), { status: 403 })
    }

    const updated = await db.conflictLog.update({ where: { id: conflictId }, data: { resolved } })
    return NextResponse.json(apiResponse(updated))
  } catch (error) {
    console.error("PATCH /api/schedules/[id]/conflicts/[conflictId] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
