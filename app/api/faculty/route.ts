import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { notifyAllSuperAdmins } from "@/lib/notifications"
import { recordAudit } from "@/lib/audit"
import { isFacultyType, maxUnitsForType, DEFAULT_HOURS_BY_TYPE } from "@/lib/faculty-types"

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    const userDeptId = getUserDepartmentId(dbUser)

    // Scoping rules — both chair roles see ONLY their own department's faculty.
    //   ADMIN (Program Chair)      — locked to their own department.
    //   SUPER_ADMIN (Dept Chair)   — likewise locked to their own department
    //     (all CAS chairs share the single CAS department, so this is the CAS
    //     pool). Any departmentId/collegeId param is ignored for both — the
    //     server, not the client, decides scope.
    // A chair with no department configured gets an empty list rather than a
    // leak of every college's faculty.
    if (!userDeptId) {
      return NextResponse.json(apiResponse([]))
    }

    // Within CAS every Dept Chair shares the one CAS department, so department
    // scope alone cannot separate them. A CAS chair heads a cluster (Social
    // Sciences / Languages, Literature, and Humanities / Mathematics and Natural
    // Sciences) and sees only that cluster's faculty. A chair with no cluster
    // assigned keeps department-wide access (nothing to narrow by).
    const chairClusterId = (dbUser as any)?.clusterId ?? null
    const clusterScope =
      dbUser?.role === "SUPER_ADMIN" && chairClusterId ? { clusterId: chairClusterId } : {}

    // ── scope=schedulable ────────────────────────────────────────────────────
    // The Add/Edit Entry pickers need everyone who could legitimately be placed on
    // a schedule entry, which is NOT the same set as the Faculty page's management
    // list. For a CAS Dept Chair the two had drifted apart badly:
    //
    //   auto-generation  -> every CAS faculty member (see the generate route: the
    //                       records were never redistributed across the three CAS
    //                       sub-departments, so college-wide is the real pool)
    //   this endpoint    -> the chair's own cluster only
    //
    // The result was that generation would assign a faculty member the manual
    // picker then refused to show, and plotting a GEC subject whose specialists sit
    // in another cluster reported "No faculty found" with no way forward.
    //
    // Opt-in so the Faculty management page keeps its deliberate cluster scoping.
    const { searchParams } = new URL(req.url)
    const schedulable = searchParams.get("scope") === "schedulable"

    const scopeFilter = schedulable && dbUser?.role === "SUPER_ADMIN"
      ? { department: { college: { abbreviation: "CAS" } } }
      : { departmentId: userDeptId, ...clusterScope }

    // Inactive faculty are still returned so a deactivated member remains
    // visible (badged "Inactive") to the chair who manages them — otherwise
    // deactivating would look identical to deleting. Consumers that need only
    // schedulable faculty filter on isActive themselves.
    //
    // The "TBA" sentinel (employeeId "TBA") is included for every chair
    // regardless of department/cluster — it's the placeholder a chair picks in
    // Add/Edit Entry when no real faculty is available yet to resolve an
    // Unassigned Queue item, so it must be selectable everywhere, not scoped
    // to whichever department happens to own the seeded row.
    // Instructors the Department Chairperson allocated to this Program Chairperson's
    // program (approved faculty requests) join the schedulable pool — for the term
    // given by ?semesterId=, or for any term when none is given — so the Add/Edit
    // picker offers exactly who the generator may assign.
    const semesterId = searchParams.get("semesterId")
    const chairProgramId = dbUser?.role === "ADMIN" ? ((dbUser as any).programHead?.programId ?? null) : null
    const allocatedIds =
      schedulable && chairProgramId
        ? (
            await db.facultyRequest.findMany({
              where: { status: "APPROVED", programId: chairProgramId, facultyId: { not: null }, ...(semesterId ? { semesterId } : {}) },
              select: { facultyId: true },
            })
          ).map((r) => r.facultyId as string)
        : []

    const faculty = await db.faculty.findMany({
      where: {
        OR: [
          scopeFilter,
          { employeeId: "TBA" },
          ...(allocatedIds.length ? [{ id: { in: allocatedIds } }] : []),
        ],
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, isActive: true } },
        department: { select: { id: true, name: true, abbreviation: true } },
        _count: { select: { scheduleEntries: true, teachingLoads: true } },
      },
      orderBy: { user: { lastName: "asc" } },
    })

    return NextResponse.json(apiResponse(faculty))
  } catch (error) {
    console.error("GET /api/faculty error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    // Only SUPER_ADMIN and ADMIN can add faculty
    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const body = await req.json()
    const { userId, firstName, lastName, email, employeeId: providedEmployeeId, departmentId, specializations, sectionCounts, employmentType: rawType, maxHoursPerWeek, hoursPerWeek } = body

    if (maxHoursPerWeek !== undefined && !(Number(maxHoursPerWeek) >= 1 && Number(maxHoursPerWeek) <= 60)) {
      return NextResponse.json(apiError("Max hours per week must be between 1 and 60"), { status: 400 })
    }
    // Employment type decides the unit cap (Regular 21 / COSI 40); the cap is
    // derived here, never taken from the client.
    if (rawType !== undefined && !isFacultyType(rawType)) {
      return NextResponse.json(apiError("Employment type must be REGULAR or COSI"), { status: 400 })
    }
    const employmentType = isFacultyType(rawType) ? rawType : "REGULAR"

    if (!departmentId) {
      return NextResponse.json(apiError("Department is required"), { status: 400 })
    }

    // ADMIN (Program Chair) can only create faculty in their own department
    if (dbUser.role === "ADMIN") {
      const adminDeptId = getUserDepartmentId(dbUser)
      if (!adminDeptId || departmentId !== adminDeptId) {
        return NextResponse.json(
          apiError("Forbidden — you can only add faculty to your own department"),
          { status: 403 }
        )
      }
    }

    // Auto-generate employeeId if not provided
    const employeeId = providedEmployeeId || `FAC-${Date.now()}`

    // Check for duplicate employeeId only if explicitly provided
    if (providedEmployeeId) {
      const existingFaculty = await db.faculty.findUnique({ where: { employeeId } })
      if (existingFaculty) {
        return NextResponse.json(apiError("A faculty member with this Employee ID already exists"), { status: 409 })
      }
    }

    let targetUserId: string

    if (userId) {
      // Link to an existing user
      const existingUser = await db.user.findUnique({ where: { id: userId } })
      if (!existingUser) {
        return NextResponse.json(apiError("User not found"), { status: 404 })
      }
      // Check if user is already linked to a faculty record
      const existingFacultyForUser = await db.faculty.findUnique({ where: { userId } })
      if (existingFacultyForUser) {
        return NextResponse.json(apiError("This user is already a faculty member"), { status: 409 })
      }
      // Do NOT change the user's role — a Department Chair or Program Chair
      // can also be assigned as faculty without losing their admin role
      targetUserId = userId
    } else if (firstName && lastName) {
      // Faculty are records only — they do NOT log in, so we never create a Supabase
      // auth account. Always create a STUB user (synthetic "manual-" supabaseId). Email,
      // if given, is stored for records/contact only (it no longer enables any login).
      if (email) {
        const existingByEmail = await db.user.findUnique({ where: { email } })
        if (existingByEmail) {
          const alreadyFaculty = await db.faculty.findUnique({ where: { userId: existingByEmail.id } })
          if (alreadyFaculty) {
            return NextResponse.json(
              apiError("A faculty member with this email already exists"),
              { status: 409 }
            )
          }
          // Email already belongs to a user (e.g. a chair) — reuse that user record.
          targetUserId = existingByEmail.id
        } else {
          const newUser = await db.user.create({
            data: {
              supabaseId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              email,
              firstName,
              lastName,
              role: "FACULTY",
              isApproved: false,
              departmentId,
            },
          })
          targetUserId = newUser.id
        }
      } else {
        const newUser = await db.user.create({
          data: {
            supabaseId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            email: null,
            firstName,
            lastName,
            role: "FACULTY",
            isApproved: false,
            departmentId,
          },
        })
        targetUserId = newUser.id
      }
    } else {
      return NextResponse.json(apiError("Either userId or firstName/lastName are required"), { status: 400 })
    }

    // A CAS Dept Chair only sees their own cluster's faculty, so anyone they add
    // is stamped with their cluster — otherwise the new record would be invisible
    // to its own creator. Chairs without a cluster (and Program Chairs, who are
    // non-CAS) leave it null.
    const creatorClusterId =
      dbUser?.role === "SUPER_ADMIN" ? ((dbUser as any).clusterId ?? null) : null

    const faculty = await db.faculty.create({
      data: {
        userId: targetUserId,
        departmentId,
        employeeId,
        ...(creatorClusterId ? { clusterId: creatorClusterId } : {}),
        specializations: specializations ?? [],
        sectionCounts: sectionCounts ?? {},
        employmentType,
        maxUnitsPerWeek: maxUnitsForType(employmentType),
        // Hours: what the form sent, else the type's default (a COSI at 40 units
        // needs more than the 30-hour default a regular faculty member gets).
        maxHoursPerWeek: maxHoursPerWeek !== undefined ? Number(maxHoursPerWeek) : DEFAULT_HOURS_BY_TYPE[employmentType],
        hoursPerWeek: hoursPerWeek ?? 0,
      },
      include: { user: true, department: true },
    })

    const facName = `${faculty.user?.firstName ?? ""} ${faculty.user?.lastName ?? ""}`

    // Notify all super admins about new faculty
    await notifyAllSuperAdmins(
      "Faculty Added",
      `${facName} (${employeeId}) has been added as faculty in ${faculty.department?.abbreviation ?? "a department"}.`,
      "faculty_added",
      "/dashboard/faculty"
    )

    await recordAudit({
      actor: dbUser as any,
      action: "faculty.created",
      entityType: "faculty",
      entityId: faculty.id,
      departmentId: faculty.departmentId,
      summary: `Added faculty ${facName.trim()} (${employeeId})`,
    })

    return NextResponse.json(apiResponse(faculty), { status: 201 })
  } catch (error) {
    console.error("POST /api/faculty error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
