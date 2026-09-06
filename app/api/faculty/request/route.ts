import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { notifyAllSuperAdmins } from "@/lib/notifications"

// POST — Program Chair sends a faculty request to Department Chair
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(apiError("Only Program Chairs can request faculty"), { status: 403 })
    }

    const departmentId = getUserDepartmentId(dbUser)
    if (!departmentId) {
      return NextResponse.json(apiError("You must be assigned to a department"), { status: 400 })
    }

    const body = await req.json()
    const { reason, subjectId } = body

    if (!reason) {
      return NextResponse.json(apiError("Please provide a reason for the request"), { status: 400 })
    }

    const request = await db.facultyRequest.create({
      data: {
        requesterId: dbUser.id,
        departmentId,
        subjectId: subjectId || null,
        reason,
      },
    })

    // Notify all Department Chairs
    const requesterName = `${dbUser.firstName ?? ""} ${dbUser.lastName ?? ""}`.trim()
    await notifyAllSuperAdmins(
      "Faculty Request",
      `${requesterName} (Program Chair) is requesting additional faculty: ${reason}`,
      "faculty_request",
      "/dashboard/users"
    )

    return NextResponse.json(apiResponse(request), { status: 201 })
  } catch (error) {
    console.error("POST /api/faculty/request error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

// GET — Department Chair views pending requests
export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(apiError("Only Department Chairs can view requests"), { status: 403 })
    }

    const departmentId = getUserDepartmentId(dbUser)

    const requests = await db.facultyRequest.findMany({
      where: {
        ...(departmentId ? { departmentId } : {}),
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(apiResponse(requests))
  } catch (error) {
    console.error("GET /api/faculty/request error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
