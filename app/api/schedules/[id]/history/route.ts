import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { recordAudit } from "@/lib/audit"
import { applyHistory, getHistoryState } from "@/lib/services/generation-history"

const GENERATING_ROLES = ["SUPER_ADMIN", "ADMIN", "PATHFIT"]

async function authorize(params: Promise<{ id: string }>) {
  const user = await getAuthenticatedUser()
  if (!user) return { error: NextResponse.json(apiError("Unauthorized"), { status: 401 }) }
  const dbUser = await getCurrentUser()
  if (!dbUser || !GENERATING_ROLES.includes(dbUser.role)) {
    return { error: NextResponse.json(apiError("Only the people who can generate a schedule can undo or redo it"), { status: 403 }) }
  }
  const { id } = await params
  const schedule = await db.schedule.findUnique({ where: { id }, select: { id: true, status: true, departmentId: true } })
  if (!schedule) return { error: NextResponse.json(apiError("Schedule not found"), { status: 404 }) }
  return { dbUser, schedule, id }
}

// GET — what the signed-in user can undo / redo on this schedule.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(params)
    if ("error" in auth) return auth.error
    return NextResponse.json(apiResponse(await getHistoryState(auth.id, auth.dbUser.id)))
  } catch (error) {
    console.error("GET /api/schedules/[id]/history error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

// POST { action: "undo" | "redo" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(params)
    if ("error" in auth) return auth.error
    const { dbUser, schedule, id } = auth

    const body = await req.json().catch(() => ({}))
    if (body.action !== "undo" && body.action !== "redo") {
      return NextResponse.json(apiError("action must be undo or redo"), { status: 400 })
    }
    if (schedule.status !== "DRAFT") {
      return NextResponse.json(apiError("Only a Draft schedule can be changed"), { status: 400 })
    }
    if (dbUser.role === "ADMIN" && schedule.departmentId !== getUserDepartmentId(dbUser)) {
      return NextResponse.json(apiError("You can only change your own department's schedule"), { status: 403 })
    }

    const result = await applyHistory(id, dbUser, body.action === "undo" ? "UNDO" : "REDO")
    if (!result.ok) return NextResponse.json(apiError(result.error), { status: result.status })

    await recordAudit({
      actor: dbUser as any,
      action: "schedule.generated",
      entityType: "schedule",
      entityId: id,
      departmentId: schedule.departmentId,
      scheduleId: id,
      summary: `${body.action === "undo" ? "Undid" : "Redid"} a generation — ${result.restored} entries restored`,
    })
    return NextResponse.json(apiResponse({ ...(await getHistoryState(id, dbUser.id)), restored: result.restored }))
  } catch (error) {
    console.error("POST /api/schedules/[id]/history error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
