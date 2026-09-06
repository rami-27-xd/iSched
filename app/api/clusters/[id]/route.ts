/**
 * PATCH /api/clusters/[id]  — update cluster (name, description, assign departments, assign supervisors)
 * DELETE /api/clusters/[id] — delete cluster (SUPER_ADMIN only)
 */
import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(apiError("Only Department Chairs can modify clusters"), { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const { name, description, departmentIds, supervisorIds } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description?.trim() || null

    // Reassign departments to this cluster
    if (Array.isArray(departmentIds)) {
      // Remove cluster from all departments currently in this cluster
      await db.department.updateMany({
        where: { clusterId: id },
        data: { clusterId: null },
      })
      // Assign the new department list
      if (departmentIds.length > 0) {
        await db.department.updateMany({
          where: { id: { in: departmentIds } },
          data: { clusterId: id },
        })
      }
    }

    // Reassign supervisors
    if (Array.isArray(supervisorIds)) {
      // Remove cluster from all current supervisors of this cluster
      await db.user.updateMany({
        where: { clusterId: id, role: "SUPER_ADMIN" },
        data: { clusterId: null },
      })
      // Assign new supervisors
      if (supervisorIds.length > 0) {
        await db.user.updateMany({
          where: { id: { in: supervisorIds }, role: "SUPER_ADMIN" },
          data: { clusterId: id },
        })
      }
    }

    const updated = await db.facultyCluster.update({
      where: { id },
      data: updateData,
      include: {
        college: { select: { name: true, abbreviation: true } },
        departments: { select: { id: true, name: true, abbreviation: true } },
        supervisors: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    })

    return NextResponse.json(apiResponse(updated))
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(apiError("A cluster with this name already exists"), { status: 409 })
    }
    console.error("PATCH /api/clusters/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(apiError("Only Department Chairs can delete clusters"), { status: 403 })
    }

    const { id } = await params

    // Detach all departments and supervisors before deleting
    await db.department.updateMany({ where: { clusterId: id }, data: { clusterId: null } })
    await db.user.updateMany({ where: { clusterId: id }, data: { clusterId: null } })
    await db.facultyCluster.delete({ where: { id } })

    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error) {
    console.error("DELETE /api/clusters/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
