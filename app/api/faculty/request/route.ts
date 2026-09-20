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
    const { reason, subjectId, semesterId: requestedSemesterId } = body

    if (!reason) {
      return NextResponse.json(apiError("Please provide a reason for the request"), { status: 400 })
    }

    // The term the instructor is needed for — the requester picks it; falls back
    // to the active semester. Allocation is per term (availability and building
    // access are per term too), so this must be pinned down at request time.
    const semester = requestedSemesterId
      ? await db.semester.findUnique({ where: { id: requestedSemesterId }, select: { id: true } })
      : await db.semester.findFirst({ where: { isActive: true }, select: { id: true } })
    if (!semester) {
      return NextResponse.json(apiError("Choose the term this request is for"), { status: 400 })
    }

    // Only a real subject id is stored; the dialogs may pass free text, which is
    // already part of the reason.
    const subject = subjectId
      ? await db.subject.findUnique({ where: { id: String(subjectId) }, select: { id: true } }).catch(() => null)
      : null

    const request = await db.facultyRequest.create({
      data: {
        requesterId: dbUser.id,
        departmentId,
        programId: (dbUser as any).programHead?.programId ?? null,
        semesterId: semester.id,
        subjectId: subject?.id ?? null,
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

    // A Department Chair sees every request; a Program Chair sees the ones they
    // submitted, so they can track their own.
    // Previously only the Dept Chair could read this, which left the requester
    // with no way to tell whether their request had been answered.
    const requests = await db.facultyRequest.findMany({
      // SUPER_ADMIN (Dept Chair) sees every request. The request's departmentId is
      // the REQUESTER's department (CIT, CAG, …), while a Dept Chair's own is CAS —
      // filtering on it meant a CIT chair's request was invisible to the very person
      // who approves it. The notification linked to this page, and the panel then
      // hid itself for having nothing to show.
      where:
        dbUser.role === "SUPER_ADMIN"
          ? {}
          : { requesterId: dbUser.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    // FacultyRequest carries only ids, so resolve the display names in one pass
    // each rather than leaving the UI to render raw cuids.
    const requesterIds = [...new Set(requests.map((r) => r.requesterId))]
    const subjectIds = [...new Set(requests.map((r) => r.subjectId).filter(Boolean) as string[])]
    const facultyIds = [...new Set(requests.map((r) => r.facultyId).filter(Boolean) as string[])]
    const semesterIds = [...new Set(requests.map((r) => r.semesterId).filter(Boolean) as string[])]
    const programIds = [...new Set(requests.map((r) => r.programId).filter(Boolean) as string[])]

    const [allocated, semesters, programs] = await Promise.all([
      facultyIds.length
        ? db.faculty.findMany({ where: { id: { in: facultyIds } }, select: { id: true, user: { select: { firstName: true, lastName: true } }, department: { select: { abbreviation: true } } } })
        : Promise.resolve([]),
      semesterIds.length
        ? db.semester.findMany({ where: { id: { in: semesterIds } }, select: { id: true, type: true, academicYear: { select: { label: true } } } })
        : Promise.resolve([]),
      programIds.length
        ? db.program.findMany({ where: { id: { in: programIds } }, select: { id: true, abbreviation: true } })
        : Promise.resolve([]),
    ])
    const facultyNameById = new Map(allocated.map((f) => [f.id, `${f.user.firstName} ${f.user.lastName}`.trim() + (f.department ? ` (${f.department.abbreviation})` : "")]))
    const termById = new Map(semesters.map((s) => [s.id, `${s.type === "FIRST" ? "1st" : s.type === "SECOND" ? "2nd" : "Summer"} Semester ${s.academicYear?.label ?? ""}`.trim()]))
    const programById = new Map(programs.map((p) => [p.id, p.abbreviation]))

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
          facultyName: r.facultyId ? facultyNameById.get(r.facultyId) ?? null : null,
          termLabel: r.semesterId ? termById.get(r.semesterId) ?? null : null,
          programAbbr: r.programId ? programById.get(r.programId) ?? null : null,
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

    const { id, action, responseNote, facultyId } = await req.json()
    if (!id || !["approve", "deny"].includes(action)) {
      return NextResponse.json(apiError("A request id and an action of approve or deny are required"), { status: 400 })
    }

    const existing = await db.facultyRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json(apiError("Request not found"), { status: 404 })

    // No department check: the Dept Chair is the approver for all Program Chairs,
    // whose requests carry THEIR department (never CAS). Role was verified above.
    if (existing.status !== "PENDING") {
      return NextResponse.json(apiError(`This request is already ${existing.status.toLowerCase()}.`), { status: 400 })
    }

    // Approving means ALLOCATING an instructor: from now on that faculty member is
    // part of the requesting program's candidate pool for the request's term (the
    // generator and the Add/Edit picker both read approved requests). They are
    // still bound by specialization and availability.
    let allocatedName: string | null = null
    if (action === "approve") {
      if (!facultyId) {
        return NextResponse.json(apiError("Choose the faculty member to allocate before approving"), { status: 400 })
      }
      const allocated = await db.faculty.findUnique({
        where: { id: facultyId },
        select: { id: true, isActive: true, user: { select: { firstName: true, lastName: true, isActive: true } } },
      })
      if (!allocated) return NextResponse.json(apiError("That faculty member no longer exists"), { status: 404 })
      if (!allocated.isActive || !allocated.user.isActive) {
        return NextResponse.json(apiError("That faculty member is inactive and cannot be allocated"), { status: 400 })
      }
      allocatedName = `${allocated.user.firstName} ${allocated.user.lastName}`.trim()
    }

    const status = action === "approve" ? "APPROVED" : "DENIED"
    const updated = await db.facultyRequest.update({
      where: { id },
      data: {
        status,
        facultyId: action === "approve" ? facultyId : null,
        respondedBy: dbUser.id,
        respondedAt: new Date(),
        responseNote: responseNote?.trim() || null,
      },
    })

    const term = existing.semesterId
      ? await db.semester.findUnique({ where: { id: existing.semesterId }, select: { type: true, academicYear: { select: { label: true } } } })
      : null
    const termLabel = term
      ? `${term.type === "FIRST" ? "1st" : term.type === "SECOND" ? "2nd" : "Summer"} Semester ${term.academicYear?.label ?? ""}`.trim()
      : "this term"

    await createNotification({
      userId: existing.requesterId,
      title: action === "approve" ? "Instructor Allocated" : "Faculty Request Declined",
      message:
        action === "approve"
          ? `${allocatedName} has been allocated to your program for ${termLabel}. They now appear in your Add Entry picker and are included when you generate.` +
            (responseNote?.trim() ? ` Note: ${responseNote.trim()}` : "")
          : `Your request for additional faculty was declined` + (responseNote?.trim() ? `: ${responseNote.trim()}` : "."),
      type: "faculty_request",
      link: "/dashboard/schedules",
    })

    return NextResponse.json(apiResponse(updated))
  } catch (error) {
    console.error("PATCH /api/faculty/request error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
