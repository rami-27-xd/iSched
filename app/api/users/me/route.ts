import { NextResponse } from "next/server"
import { getCurrentUser, getAuthenticatedUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { CLUSTER_GEC_CODES } from "@/lib/services/subject-permissions"

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const departmentId = getUserDepartmentId(user)
    const clusterId = (user as any).clusterId ?? null

    // Resolve department name from all possible sources
    const departmentName =
      user.department?.name ??
      user.departmentChair?.department?.name ??
      user.programHead?.program?.department?.name ??
      user.faculty?.department?.name ??
      null

    // GEC/GEL codes this Dept Chair's cluster owns — exposed so the client can
    // narrow the Add/Edit Entry subject dropdown without duplicating the
    // CLUSTER_GEC_CODES map (server-only, keyed by cluster name not id) in a
    // client component.
    let myOwnedGecCodes: string[] = []
    if (user.role === "SUPER_ADMIN" && clusterId) {
      const cluster = await db.facultyCluster.findUnique({ where: { id: clusterId }, select: { name: true } })
      myOwnedGecCodes = CLUSTER_GEC_CODES[cluster?.name ?? ""] ?? []
    }

    return NextResponse.json(apiResponse({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isApproved: user.isApproved,
      isActive: user.isActive,
      faculty: user.faculty,
      departmentId,
      departmentName,
      departmentChair: user.departmentChair,
      programHead: user.programHead,
      clusterId,
      myOwnedGecCodes,
    }))
  } catch (error) {
    console.error("GET /api/users/me error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const supabaseUser = await getAuthenticatedUser()
    if (!supabaseUser) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json(apiError("User not found"), { status: 404 })
    }

    const body = await req.json()
    const { firstName, lastName, departmentId, clusterId } = body

    const updateData: Record<string, unknown> = {
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
    }

    // Only SUPER_ADMIN (Department Chair) can set which CAS cluster they head
    // (Social Sciences / Languages, Literature, and Humanities / Mathematics
    // and Natural Sciences). User.clusterId IS the FacultyCluster.supervisors
    // link, so setting it here makes them that cluster's head.
    if (clusterId !== undefined && currentUser.role === "SUPER_ADMIN") {
      updateData.clusterId = clusterId || null
    }

    // Only SUPER_ADMIN can change their own department
    if (departmentId !== undefined && currentUser.role === "SUPER_ADMIN") {
      updateData.departmentId = departmentId || null

      // Also sync departmentChair relation
      if (departmentId) {
        try {
          const existing = await db.departmentChair.findUnique({ where: { userId: currentUser.id } })
          if (existing) {
            await db.departmentChair.update({ where: { userId: currentUser.id }, data: { departmentId } })
          } else {
            // Check if another chair already owns this department
            const deptChair = await db.departmentChair.findUnique({ where: { departmentId } })
            if (deptChair && deptChair.userId !== currentUser.id) {
              // Reassign — remove old, create new
              await db.departmentChair.delete({ where: { departmentId } })
            }
            await db.departmentChair.create({ data: { userId: currentUser.id, departmentId } })
          }
        } catch (e) {
          console.error("departmentChair sync error:", e)
          // Non-fatal — continue with name update
        }
      } else {
        await db.departmentChair.deleteMany({ where: { userId: currentUser.id } })
      }
    }

    const updated = await db.user.update({
      where: { id: currentUser.id },
      data: updateData,
    })

    return NextResponse.json(apiResponse({
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      role: updated.role,
    }))
  } catch (error) {
    console.error("PATCH /api/users/me error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
