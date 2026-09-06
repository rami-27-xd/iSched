import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Write-permission guard for faculty records:
 *   SUPER_ADMIN (Dept Chair) — faculty in their own department, AND (when both
 *     sides have a cluster assigned) their own CAS cluster only.
 *   ADMIN (Program Chair) — only faculty in their own department.
 *   Everyone else — forbidden.
 *
 * NOTE: all three CAS cluster chairs share the same departmentId, so the
 * department check alone only enforces the cross-COLLEGE boundary. The cluster
 * check below closes the intra-CAS gap, but only once a faculty row actually has
 * clusterId set — an unassigned faculty (the common case today, since this is
 * new) still falls through to department-only enforcement. Assign clusters via
 * the Faculty edit dialog (SUPER_ADMIN, CAS faculty only) to tighten this over time.
 * Returns an error response to send, or null when the caller is allowed.
 */
async function checkFacultyWriteAccess(facultyId: string): Promise<
  { error: NextResponse; dbUser?: never } | { error: null; dbUser: any }
> {
  const dbUser = await getCurrentUser()
  if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
    return { error: NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 }) }
  }

  const target = await db.faculty.findUnique({
    where: { id: facultyId },
    select: { departmentId: true, clusterId: true },
  })
  if (!target) {
    return { error: NextResponse.json(apiError("Faculty not found"), { status: 404 }) }
  }

  if (dbUser.role === "ADMIN" || dbUser.role === "SUPER_ADMIN") {
    const chairDeptId = getUserDepartmentId(dbUser)
    if (!chairDeptId || target.departmentId !== chairDeptId) {
      return {
        error: NextResponse.json(
          apiError("Forbidden — you can only manage faculty in your own department"),
          { status: 403 }
        ),
      }
    }
  }

  // Mirror the read scope in GET /api/faculty exactly: a CAS Dept Chair who
  // heads a cluster may only touch that cluster's faculty. (Previously this
  // passed whenever the target had no cluster, letting a chair edit a faculty
  // member they cannot even see.) A chair with no cluster keeps dept-wide access.
  if (dbUser.role === "SUPER_ADMIN") {
    const chairClusterId = (dbUser as any).clusterId ?? null
    if (chairClusterId && target.clusterId !== chairClusterId) {
      return {
        error: NextResponse.json(
          apiError("Forbidden — this faculty member is not in your cluster"),
          { status: 403 }
        ),
      }
    }
  }

  return { error: null, dbUser }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const faculty = await db.faculty.findUnique({
      where: { id },
      include: {
        user: true,
        department: true,
        availability: true,
        _count: { select: { scheduleEntries: true, teachingLoads: true } },
      },
    })

    if (!faculty) return NextResponse.json(apiError("Faculty not found"), { status: 404 })
    return NextResponse.json(apiResponse(faculty))
  } catch (error) {
    console.error("GET /api/faculty/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const access = await checkFacultyWriteAccess(id)
    if (access.error) return access.error

    const body = await req.json()
    const { employeeId, departmentId, clusterId, specializations, sectionCounts, maxUnitsPerWeek, hoursPerWeek, isActive, firstName, lastName, email } = body

    // ADMIN cannot move faculty into another department
    if (access.dbUser.role === "ADMIN" && departmentId !== undefined) {
      const adminDeptId = getUserDepartmentId(access.dbUser)
      if (departmentId !== adminDeptId) {
        return NextResponse.json(
          apiError("Forbidden — cannot move faculty to another department"),
          { status: 403 }
        )
      }
    }

    // Only SUPER_ADMIN (CAS Dept Chair) assigns a faculty's cluster — ADMIN
    // faculty are never CAS, so clusters don't apply to them.
    if (clusterId !== undefined && access.dbUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        apiError("Forbidden — only a Department Chairperson can assign a faculty's cluster"),
        { status: 403 }
      )
    }

    const faculty = await db.faculty.update({
      where: { id },
      data: {
        ...(employeeId !== undefined ? { employeeId } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(clusterId !== undefined ? { clusterId: clusterId || null } : {}),
        ...(specializations !== undefined ? { specializations } : {}),
        ...(sectionCounts !== undefined ? { sectionCounts } : {}),
        ...(maxUnitsPerWeek !== undefined ? { maxUnitsPerWeek: Number(maxUnitsPerWeek) } : {}),
        ...(hoursPerWeek !== undefined ? { hoursPerWeek: Number(hoursPerWeek) } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: { user: true, department: true },
    })

    // Update the linked User record if name or email provided
    if ((firstName !== undefined || lastName !== undefined || email !== undefined) && faculty.userId) {
      const linkedUser = faculty.user as any
      const isStub = linkedUser?.supabaseId?.startsWith("manual-")
      const newEmail: string | null = email === "" ? null : (email ?? undefined)

      // If a real email is being added to a stub user, create a Supabase auth account
      if (isStub && newEmail && newEmail !== linkedUser?.email) {
        const existingByEmail = await db.user.findUnique({ where: { email: newEmail } })
        if (existingByEmail && existingByEmail.id !== faculty.userId) {
          return NextResponse.json(apiError("This email is already registered"), { status: 409 })
        }
        if (!existingByEmail) {
          const supabaseAdmin = createAdminClient()
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: newEmail,
            email_confirm: true,
            user_metadata: {
              first_name: firstName ?? linkedUser?.firstName,
              last_name: lastName ?? linkedUser?.lastName,
            },
          })
          if (authError) {
            const isDuplicate = authError.status === 422 || authError.message?.toLowerCase().includes("already")
            return NextResponse.json(
              apiError(isDuplicate ? "This email is already registered in the auth system" : `Auth error: ${authError.message}`),
              { status: isDuplicate ? 409 : 500 }
            )
          }
          // Swap the stub supabaseId for the real one
          await db.user.update({
            where: { id: faculty.userId },
            data: { supabaseId: authData.user.id },
          })
        }
      }

      await db.user.update({
        where: { id: faculty.userId },
        data: {
          ...(firstName !== undefined ? { firstName } : {}),
          ...(lastName !== undefined ? { lastName } : {}),
          ...(email !== undefined ? { email: newEmail } : {}),
        },
      })
    }

    // Re-fetch with updated user data
    const updated = await db.faculty.findUnique({
      where: { id },
      include: { user: true, department: true },
    })

    return NextResponse.json(apiResponse(updated))
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json(apiError("Faculty not found"), { status: 404 })
    console.error("PATCH /api/faculty/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const access = await checkFacultyWriteAccess(id)
    if (access.error) return access.error

    // ScheduleEntry -> Faculty is a restrict FK, so a faculty member still
    // holding assignments cannot be deleted. Report that as an actionable 409
    // instead of letting the FK violation surface as a generic 500.
    const entryCount = await db.scheduleEntry.count({ where: { facultyId: id } })
    if (entryCount > 0) {
      return NextResponse.json(
        apiError(
          `Cannot delete — this faculty still has ${entryCount} schedule ${entryCount === 1 ? "entry" : "entries"} assigned. Reassign or remove those entries first, or set the faculty to Inactive instead.`
        ),
        { status: 409 }
      )
    }

    const faculty = await db.faculty.findUnique({
      where: { id },
      select: { userId: true, user: { select: { supabaseId: true } } },
    })

    await db.faculty.delete({ where: { id } })

    // Faculty are stub records ("manual-" supabaseId, no login). Remove the
    // orphaned stub User too so it stops appearing in User Management.
    if (faculty?.user?.supabaseId?.startsWith("manual-")) {
      await db.user.delete({ where: { id: faculty.userId } }).catch(() => {
        // non-fatal: the faculty row is already gone
      })
    }

    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json(apiError("Faculty not found"), { status: 404 })
    if (error?.code === "P2003") {
      return NextResponse.json(
        apiError("Cannot delete — this faculty is still referenced by existing records. Set them to Inactive instead."),
        { status: 409 }
      )
    }
    console.error("DELETE /api/faculty/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
