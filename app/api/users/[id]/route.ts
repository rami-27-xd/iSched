import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, getUserDepartmentId, singletonRoleHolderExists, departmentDeanExists } from '@/lib/auth'
import { apiResponse, apiError, handleApiError } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'
import { ROLE_LABELS, isSingletonRole, type UserRole } from '@/lib/roles'

// PATCH /api/users/[id] — Update user (approve, change role, deactivate)
//   DEAN only — accounts of their OWN department (spec §1: the Dean, not the
//   Department Chairperson, approves accounts). May approve, set the
//   department / program / cluster, change the role and (de)activate. No other
//   role can reach User Management at all.
// One Dean per department and exactly one PATHFIT / NSTP account are enforced
// here as well as at sign-up, so a role change or approval can never create a
// second one.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireRole('DEAN')
    const { id } = await params
    const body = await request.json()

    const { role, isApproved, isActive, departmentId, programId, clusterId } = body

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, departmentId: true, isApproved: true, isActive: true, firstName: true, lastName: true, email: true, createdAt: true },
    })
    if (!target) {
      return NextResponse.json(apiError('User not found'), { status: 404 })
    }

    const deanDeptId = getUserDepartmentId(currentUser)
    if (!deanDeptId) {
      return NextResponse.json(apiError('Your Dean account is not linked to a department'), { status: 403 })
    }
    // Strictly their own department — both the account's current department and
    // any department it is being moved to.
    if (target.departmentId !== deanDeptId && id !== currentUser.id) {
      return NextResponse.json(
        apiError('Forbidden — you can only manage accounts that belong to your own department'),
        { status: 403 }
      )
    }
    if (departmentId !== undefined && departmentId && departmentId !== deanDeptId) {
      return NextResponse.json(
        apiError('Forbidden — you cannot move an account to another department'),
        { status: 403 }
      )
    }

    // Validate role if provided
    const validRoles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'DEAN', 'PATHFIT', 'NSTP']
    if (role !== undefined && !validRoles.includes(role)) {
      return NextResponse.json(apiError('Invalid role'), { status: 400 })
    }

    // Singleton rules — the resulting (role, department, approved) state must not
    // create a second Dean for a department or a second PATHFIT / NSTP account.
    const nextRole = (role ?? target.role) as UserRole
    const nextDeptId = departmentId !== undefined ? (departmentId || null) : target.departmentId
    const nextApproved = isApproved !== undefined ? !!isApproved : target.isApproved
    const nextActive = isActive !== undefined ? !!isActive : target.isActive
    if (nextApproved && nextActive) {
      if (nextRole === 'DEAN' && nextDeptId && (await departmentDeanExists(nextDeptId, id))) {
        return NextResponse.json(
          apiError('That department already has a Dean — only one Dean account is allowed per department.'),
          { status: 409 }
        )
      }
      if (isSingletonRole(nextRole) && (await singletonRoleHolderExists(nextRole, id))) {
        return NextResponse.json(
          apiError(`A ${ROLE_LABELS[nextRole]} account already exists — only one is allowed.`),
          { status: 409 }
        )
      }
    }

    // Prevent self-demotion
    if (id === currentUser.id && role && role !== currentUser.role) {
      return NextResponse.json(apiError('Cannot change your own role'), { status: 400 })
    }

    // Prevent self-deactivation
    if (id === currentUser.id && isActive === false) {
      return NextResponse.json(apiError('Cannot deactivate your own account'), { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (role !== undefined) updateData.role = role
    if (isApproved !== undefined) updateData.isApproved = isApproved
    if (isActive !== undefined) updateData.isActive = isActive
    if (departmentId !== undefined) updateData.departmentId = departmentId || null
    // clusterId: which CAS sub-area (Faculty Cluster) this Dept Chair oversees
    if (clusterId !== undefined) updateData.clusterId = clusterId || null

    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isApproved: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        department: { select: { id: true, name: true, abbreviation: true } },
      },
    })

    // Also sync role-specific relations when department is assigned
    if (departmentId !== undefined && departmentId) {
      const targetRole = role ?? user.role

      if (targetRole === 'SUPER_ADMIN') {
        // User.departmentId (set above in updateData) is the primary source for
        // getUserDepartmentId(). DepartmentChair is a secondary index — skip creating
        // it when another user already holds the record for this dept (e.g. multiple
        // CAS Dept Heads sharing one CAS department).
        const existingByUser = await db.departmentChair.findUnique({ where: { userId: id } })
        const existingByDept = await db.departmentChair.findUnique({ where: { departmentId } })
        if (existingByUser) {
          // Only update the user's own record if it won't conflict with another user's
          if (!existingByDept || existingByDept.userId === id) {
            await db.departmentChair.update({ where: { userId: id }, data: { departmentId } })
          }
        } else if (!existingByDept) {
          // No chair record for this dept yet — safe to create
          await db.departmentChair.create({ data: { userId: id, departmentId } })
        }
        // If existingByDept belongs to a different user, skip — User.departmentId suffices
      } else if (targetRole === 'FACULTY') {
        const existing = await db.faculty.findUnique({ where: { userId: id } })
        if (existing) {
          await db.faculty.update({ where: { userId: id }, data: { departmentId } })
        } else {
          await db.faculty.create({ data: { userId: id, departmentId, employeeId: `FAC-${Date.now()}` } })
        }
      } else if (targetRole === 'ADMIN') {
        // Program Chair is also a faculty member in their own department
        const existing = await db.faculty.findUnique({ where: { userId: id } })
        if (existing) {
          await db.faculty.update({ where: { userId: id }, data: { departmentId } })
        } else {
          await db.faculty.create({ data: { userId: id, departmentId, employeeId: `FAC-${Date.now()}` } })
        }
      }
    }

    // ADMIN (Program Chair): sync programHead relation when programId is provided
    if (programId !== undefined) {
      const targetRole = role ?? user.role
      if (targetRole === 'ADMIN') {
        if (programId) {
          // ProgramHead.programId is unique — one chair per program. Report a
          // conflict plainly instead of letting the constraint surface as a 500.
          const claimedBy = await db.programHead.findUnique({
            where: { programId },
            include: { user: { select: { firstName: true, lastName: true } } },
          })
          if (claimedBy && claimedBy.userId !== id) {
            const who = `${claimedBy.user?.firstName ?? ""} ${claimedBy.user?.lastName ?? ""}`.trim()
            return NextResponse.json(
              apiError(
                `That program is already chaired by ${who || "another user"}. Reassign or clear their program first.`
              ),
              { status: 409 }
            )
          }

          const existing = await db.programHead.findUnique({ where: { userId: id } })
          if (existing) {
            await db.programHead.update({ where: { userId: id }, data: { programId } })
          } else {
            await db.programHead.create({ data: { userId: id, programId } })
          }
        } else {
          // Remove programHead if programId is cleared
          await db.programHead.deleteMany({ where: { userId: id } })
        }
      }
    }

    // ── Audit trail (Dean's System Logs) ───────────────────────────────────
    const targetName = `${target.firstName} ${target.lastName}`.trim() || target.email || id
    const auditDept = nextDeptId ?? target.departmentId ?? null
    const accountMeta = { Account: targetName, Email: target.email ?? "", Role: ROLE_LABELS[nextRole] }
    if (isApproved === true && !target.isApproved) {
      await recordAudit({ actor: currentUser as any, action: 'user.approved', entityType: 'user', entityId: id, departmentId: auditDept, summary: `Approved ${targetName} as ${ROLE_LABELS[nextRole]}`, metadata: { ...accountMeta, "Registered on": target.createdAt.toISOString() } })
    } else if (isActive === false && target.isActive) {
      await recordAudit({ actor: currentUser as any, action: 'user.deactivated', entityType: 'user', entityId: id, departmentId: auditDept, summary: `Deactivated ${targetName}`, metadata: accountMeta })
    } else if (isActive === true && !target.isActive) {
      await recordAudit({ actor: currentUser as any, action: 'user.activated', entityType: 'user', entityId: id, departmentId: auditDept, summary: `Reactivated ${targetName}`, metadata: accountMeta })
    } else {
      const changes: string[] = []
      if (role !== undefined && role !== target.role) changes.push(`role → ${ROLE_LABELS[nextRole]}`)
      if (departmentId !== undefined) changes.push('department')
      if (programId !== undefined) changes.push('program')
      if (clusterId !== undefined) changes.push('cluster')
      if (changes.length) {
        await recordAudit({
          actor: currentUser as any, action: 'user.updated', entityType: 'user', entityId: id, departmentId: auditDept,
          summary: `Updated ${targetName} (${changes.join(', ')})`,
          metadata: {
            ...accountMeta,
            ...(role !== undefined && role !== target.role ? { "Previous role": ROLE_LABELS[target.role as UserRole] ?? target.role } : {}),
            Changed: changes.join(", "),
          },
        })
      }
    }

    if (body.isApproved === true) {
      await createNotification({
        userId: user.id,
        title: "Account Approved",
        message: "Your account has been approved by your Dean. You can now access the system.",
        type: "user_approved",
        link: "/dashboard",
      })

      // If the approved user is a Program Chair (ADMIN) with a department,
      // ensure they also have a faculty record
      const approvedUser = await db.user.findUnique({
        where: { id },
        select: { role: true, departmentId: true },
      })
      if (approvedUser?.role === 'ADMIN' && approvedUser.departmentId) {
        const existingFaculty = await db.faculty.findUnique({ where: { userId: id } })
        if (!existingFaculty) {
          await db.faculty.create({
            data: {
              userId: id,
              departmentId: approvedUser.departmentId,
              employeeId: `FAC-${Date.now()}`,
            },
          })
        }
      }
    }

    return NextResponse.json(apiResponse(user))
  } catch (error) {
    const err = handleApiError(error)
    const status = err.error === 'Unauthorized' ? 403 : 500
    return NextResponse.json(err, { status })
  }
}

// DELETE /api/users/[id] — Permanently remove a login account. The Dean of the
// account's department only. Replaces the old "Revoke Approval" action: an
// account that should not have access is deleted outright rather than left
// around in a revoked state.
//
// Removes, in order: the chair/head/faculty rows hanging off the user, the
// user's notifications, the User row, and finally the Supabase Auth account so
// the person can no longer sign in. Faculty records that still hold schedule
// entries block the delete (restrict FK) — reported as an actionable 409.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireRole('DEAN')
    const { id } = await params

    if (id === currentUser.id) {
      return NextResponse.json(apiError('You cannot delete your own account'), { status: 400 })
    }

    const target = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        supabaseId: true,
        firstName: true,
        lastName: true,
        role: true,
        departmentId: true,
        faculty: { select: { id: true, _count: { select: { scheduleEntries: true, teachingLoads: true } } } },
      },
    })
    if (!target) {
      return NextResponse.json(apiError('User not found'), { status: 404 })
    }

    const deanDeptId = getUserDepartmentId(currentUser)
    if (!deanDeptId || target.departmentId !== deanDeptId) {
      return NextResponse.json(
        apiError('Forbidden — you can only delete accounts that belong to your own department'),
        { status: 403 }
      )
    }

    const entryCount = target.faculty?._count.scheduleEntries ?? 0
    if (entryCount > 0) {
      return NextResponse.json(
        apiError(
          `Cannot delete — ${target.firstName} ${target.lastName} still has ${entryCount} schedule ${entryCount === 1 ? 'entry' : 'entries'} assigned. Reassign or remove those entries first, or deactivate the account instead.`
        ),
        { status: 409 }
      )
    }

    await db.$transaction(async (tx) => {
      await tx.departmentChair.deleteMany({ where: { userId: id } })
      await tx.programHead.deleteMany({ where: { userId: id } })
      if (target.faculty) {
        await tx.teachingLoad.deleteMany({ where: { facultyId: target.faculty.id } })
        // availability + buildingAvailability cascade from Faculty
        await tx.faculty.delete({ where: { id: target.faculty.id } })
      }
      await tx.notification.deleteMany({ where: { userId: id } })
      await tx.user.delete({ where: { id } })
    })

    // Real login accounts have a Supabase Auth user; stub records ("manual-…")
    // never did. Auth deletion is best-effort — the DB row is already gone, so a
    // failure here must not roll the request back into a confusing half-state.
    if (target.supabaseId && !target.supabaseId.startsWith('manual-')) {
      try {
        const admin = createAdminClient()
        const { error } = await admin.auth.admin.deleteUser(target.supabaseId)
        if (error) console.error('DELETE /api/users/[id] auth deletion failed:', error.message)
      } catch (authError) {
        console.error('DELETE /api/users/[id] auth deletion failed:', authError)
      }
    }

    await recordAudit({
      actor: currentUser as any,
      action: 'user.deleted',
      entityType: 'user',
      entityId: id,
      departmentId: target.departmentId,
      summary: `Deleted the ${ROLE_LABELS[target.role as UserRole] ?? target.role} account of ${target.firstName} ${target.lastName}`.trim(),
    })

    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error: any) {
    if (error?.code === 'P2003') {
      return NextResponse.json(
        apiError('Cannot delete — this account is still referenced by existing records. Deactivate it instead.'),
        { status: 409 }
      )
    }
    const err = handleApiError(error)
    const status = err.error === 'Unauthorized' ? 403 : 500
    return NextResponse.json(err, { status })
  }
}
