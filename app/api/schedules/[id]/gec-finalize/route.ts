import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { getGecFinalizationStatus } from "@/lib/services/workflow-gates"
import { createNotification } from "@/lib/notifications"
import { recordAudit } from "@/lib/audit"

// GET /api/schedules/[id]/gec-finalize — per-cluster finalization status for
// this schedule, with names, so the UI can show "Social Sciences ✓ (Mary Grace
// Delos Santos, Sep 17) · Languages… — pending · Mathematics… — pending".
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    const { id } = await params

    const clusters = await db.facultyCluster.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
    const rows = await db.gecFinalization.findMany({
      where: { scheduleId: id },
      include: { cluster: { select: { id: true, name: true } }, },
    })
    const byUserIds = [...new Set(rows.map((r) => r.finalizedBy))]
    const users = byUserIds.length
      ? await db.user.findMany({ where: { id: { in: byUserIds } }, select: { id: true, firstName: true, lastName: true } })
      : []
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
    const byClusterId = new Map(rows.map((r) => [r.clusterId, r]))

    const clustersOut = clusters.map((c) => {
      const row = byClusterId.get(c.id)
      return {
        id: c.id,
        name: c.name,
        finalized: !!row,
        finalizedBy: row ? nameById.get(row.finalizedBy) ?? null : null,
        finalizedAt: row?.finalizedAt ?? null,
      }
    })

    return NextResponse.json(
      apiResponse({
        clusters: clustersOut,
        allFinalized: clusters.length > 0 && clustersOut.every((c) => c.finalized),
      })
    )
  } catch (error) {
    console.error("GET /api/schedules/[id]/gec-finalize error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

// POST { action: "finalize" | "unfinalize", clusterId? }
//   SUPER_ADMIN with a cluster — only their own cluster; clusterId is optional
//     and, if given, must equal it.
//   SUPER_ADMIN with no cluster (full-access fallback) — must specify which
//     cluster they're finalizing on behalf of.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(apiError("Only a Department Chairperson can finalize GEC/GEL scheduling"), { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const { action, clusterId: requestedClusterId } = body as { action?: string; clusterId?: string }
    if (!action || !["finalize", "unfinalize"].includes(action)) {
      return NextResponse.json(apiError('action must be "finalize" or "unfinalize"'), { status: 400 })
    }

    const myClusterId = (dbUser as any).clusterId as string | null
    let clusterId: string
    if (myClusterId) {
      if (requestedClusterId && requestedClusterId !== myClusterId) {
        return NextResponse.json(apiError("You can only finalize your own cluster"), { status: 403 })
      }
      clusterId = myClusterId
    } else {
      if (!requestedClusterId) {
        return NextResponse.json(apiError("Specify which cluster you are finalizing on behalf of"), { status: 400 })
      }
      const cluster = await db.facultyCluster.findUnique({ where: { id: requestedClusterId }, select: { id: true } })
      if (!cluster) return NextResponse.json(apiError("Unknown cluster"), { status: 404 })
      clusterId = requestedClusterId
    }

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: { department: { select: { id: true, abbreviation: true } } },
    })
    if (!schedule) return NextResponse.json(apiError("Schedule not found"), { status: 404 })

    const clusterRow = await db.facultyCluster.findUniqueOrThrow({ where: { id: clusterId }, select: { name: true } })

    if (action === "unfinalize") {
      await db.gecFinalization.deleteMany({ where: { scheduleId: id, clusterId } })
      await recordAudit({
        actor: dbUser as any,
        action: "schedule.gecReopened",
        entityType: "schedule",
        entityId: id,
        departmentId: schedule.departmentId,
        scheduleId: id,
        summary: `${clusterRow.name} reopened GEC/GEL for ${schedule.department?.abbreviation ?? "this schedule"}`,
      })
      return NextResponse.json(apiResponse({ finalized: false }))
    }

    await db.gecFinalization.upsert({
      where: { scheduleId_clusterId: { scheduleId: id, clusterId } },
      update: { finalizedBy: dbUser.id, finalizedAt: new Date() },
      create: { scheduleId: id, clusterId, finalizedBy: dbUser.id },
    })

    await recordAudit({
      actor: dbUser as any,
      action: "schedule.gecClusterFinalized",
      entityType: "schedule",
      entityId: id,
      departmentId: schedule.departmentId,
      scheduleId: id,
      summary: `${clusterRow.name} finalized GEC/GEL for ${schedule.department?.abbreviation ?? "this schedule"}`,
    })

    const status = await getGecFinalizationStatus(id)
    if (status.allFinalized && schedule.departmentId) {
      // Only Program Chairpersons (ADMIN) are gated by this — tell them it's
      // their turn. CAS's own schedule has no Program Chairpersons, so this is
      // simply a no-op there.
      const programChairs = await db.user.findMany({
        where: { role: "ADMIN", isApproved: true, isActive: true, programHead: { program: { departmentId: schedule.departmentId } } },
        select: { id: true },
      })
      for (const pc of programChairs) {
        await createNotification({
          userId: pc.id,
          title: "GEC/GEL Finalized — You May Proceed",
          message: `All three CAS cluster chairpersons have finalized GEC/GEL for ${schedule.department?.abbreviation ?? "your department"}. You can now add your major subjects.`,
          type: "workflow_approved",
          link: "/dashboard/schedules",
        })
      }
      await recordAudit({
        actor: dbUser as any,
        action: "schedule.gecFullyFinalized",
        entityType: "schedule",
        entityId: id,
        departmentId: schedule.departmentId,
        scheduleId: id,
        summary: `All 3 clusters finalized GEC/GEL for ${schedule.department?.abbreviation ?? "this schedule"} — ${programChairs.length} Program Chairperson(s) notified`,
      })
    }

    return NextResponse.json(apiResponse({ finalized: true, allFinalized: status.allFinalized }))
  } catch (error) {
    console.error("POST /api/schedules/[id]/gec-finalize error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
