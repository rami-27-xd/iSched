import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { createNotification, notifyAllSuperAdmins } from "@/lib/notifications"

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
      "/dashboard/faculty"
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
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden"), { status: 403 })
    }

    const departmentId = getUserDepartmentId(dbUser)

    // A Department Chair sees every request raised against their department; a
    // Program Chair sees the ones they submitted, so they can track their own.
    // Previously only the Dept Chair could read this, which left the requester
    // with no way to tell whether their request had been answered.
    const requests = await db.facultyRequest.findMany({
      where:
        dbUser.role === "SUPER_ADMIN"
          ? { ...(departmentId ? { departmentId } : {}) }
          : { requesterId: dbUser.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    // FacultyRequest carries only ids, so resolve the display names in one pass
    // each rather than leaving the UI to render raw cuids.
    const requesterIds = [...new Set(requests.map((r) => r.requesterId))]
    const subjectIds = [...new Set(requests.map((r) => r.subjectId).filter(Boolean) as string[])]

    const [requesters, subjects] = await Promise.all([
      requesterIds.length
        ? db.user.findMany({
            where: { id: { in: requesterIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      subjectIds.length
        ? db.subject.findMany({
            where: { id: { in: subjectIds } },
            select: { id: true, code: true, title: true },
          })
        : Promise.resolve([]),
    ])

    const nameById = new Map(requesters.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
    const subjectById = new Map(subjects.map((s) => [s.id, s]))

    return NextResponse.json(
      apiResponse(
        requests.map((r) => ({
          ...r,
          requesterName: nameById.get(r.requesterId) ?? "Unknown",
          subjectCode: r.subjectId ? subjectById.get(r.subjectId)?.code ?? null : null,
          subjectTitle: r.subjectId ? subjectById.get(r.subjectId)?.title ?? null : null,
        }))
      )
    )
  } catch (error) {
    console.error("GET /api/faculty/request error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

// PATCH — Department Chair approves or denies a request, and the requester is told.
// Without this the request could be raised and read but never actually closed.
export async function PATCH(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(apiError("Only Department Chairs can respond to faculty requests"), { status: 403 })
    }

    const { id, action, responseNote } = await req.json()
    if (!id || !["approve", "deny"].includes(action)) {
      return NextResponse.json(apiError("A request id and an action of approve or deny are required"), { status: 400 })
    }

    const existing = await db.facultyRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json(apiError("Request not found"), { status: 404 })

    const departmentId = getUserDepartmentId(dbUser)
    if (departmentId && existing.departmentId !== departmentId) {
      return NextResponse.json(apiError("This request belongs to another department"), { status: 403 })
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json(apiError(`This request is already ${existing.status.toLowerCase()}.`), { status: 400 })
    }

    const status = action === "approve" ? "APPROVED" : "DENIED"
    const updated = await db.facultyRequest.update({
      where: { id },
      data: {
        status,
        respondedBy: dbUser.id,
        respondedAt: new Date(),
        responseNote: responseNote?.trim() || null,
      },
    })

    await createNotification({
      userId: existing.requesterId,
      title: action === "approve" ? "Faculty Request Approved" : "Faculty Request Declined",
      message:
        `Your request for additional faculty was ${action === "approve" ? "approved" : "declined"}` +
        (responseNote?.trim() ? `: ${responseNote.trim()}` : "."),
      type: "faculty_request",
      link: "/dashboard/faculty",
    })

    return NextResponse.json(apiResponse(updated))
  } catch (error) {
    console.error("PATCH /api/faculty/request error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
