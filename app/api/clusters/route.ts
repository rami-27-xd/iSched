/**
 * GET  /api/clusters  — list all faculty clusters (with department + supervisor counts)
 * POST /api/clusters  — create a new cluster (SUPER_ADMIN only)
 */
import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { searchParams } = new URL(req.url)
    const collegeId = searchParams.get("collegeId")

    const clusters = await db.facultyCluster.findMany({
      where: collegeId ? { collegeId } : undefined,
      include: {
        college: { select: { name: true, abbreviation: true } },
        departments: { select: { id: true, name: true, abbreviation: true } },
        supervisors: {
          where: { role: "SUPER_ADMIN" },
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(apiResponse(clusters))
  } catch (error) {
    console.error("GET /api/clusters error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(apiError("Only Department Chairs can create clusters"), { status: 403 })
    }

    const body = await req.json()
    const { name, description, collegeId } = body

    if (!name?.trim()) {
      return NextResponse.json(apiError("Cluster name is required"), { status: 400 })
    }

    const cluster = await db.facultyCluster.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        collegeId: collegeId || null,
      },
      include: {
        college: { select: { name: true, abbreviation: true } },
        departments: true,
        supervisors: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    return NextResponse.json(apiResponse(cluster), { status: 201 })
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(apiError("A cluster with this name already exists"), { status: 409 })
    }
    console.error("POST /api/clusters error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
