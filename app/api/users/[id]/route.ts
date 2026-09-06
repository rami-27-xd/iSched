import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, getUserDepartmentId } from '@/lib/auth'
import { apiResponse, apiError, handleApiError } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

// PATCH /api/users/[id] — Update user (approve, change role, deactivate)
// SUPER_ADMIN: full access. ADMIN (Program Chair): may only approve/revoke and
// activate/deactivate FACULTY accounts in their own department.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireRole('SUPER_ADMIN', 'ADMIN')
    const { id } = await params
    const body = await request.json()

    const { role, isApproved, isActive, departmentId, programId, clusterId } = body

    if (currentUser.role === 'ADMIN') {
      const adminDeptId = getUserDepartmentId(currentUser)

      if (id === currentUser.id) {
        // Self-service: a Program Chairperson may set the program they chair —
        // and nothing else. Without this they cannot fix their own "No program
        // assigned" state, which blocks them from scheduling their majors.
        if (
          role !== undefined || departmentId !== undefined || clusterId !== undefined ||
          isApproved !== undefined || isActive !== undefined
        ) {
          return NextResponse.json(
            apiError('Forbidden — you can only change the program you chair'),
            { status: 403 }
          )
        }
        if (programId) {
          const program = await db.program.findUnique({ where: { id: programId } })
          if (!program || !adminDeptId || program.departmentId !== adminDeptId) {
            return NextResponse.json(
              apiError('Forbidden — choose a program from your own department'),
              { status: 403 }
            )
          }
        }
      } else {
        // Acting on someone else: approval/active flags only, and only for
        // faculty in their own department.
        if (role !== undefined || departmentId !== undefined || programId !== undefined || clusterId !== undefined) {
          return NextResponse.json(
            apiError('Forbidden — Program Chairs can only approve or deactivate faculty accounts'),
            { status: 403 }
          )
        }

        const target = await db.user.findUnique({
          where: { id },
          select: { role: true, departmentId: true },
        })
        if (!target) {
          return NextResponse.json(apiError('User not found'), { status: 404 })
        }

        if (target.role !== 'FACULTY' || !adminDeptId || target.departmentId !== adminDeptId) {
          return NextResponse.json(
            apiError('Forbidden — you can only manage faculty accounts in your own department'),
            { status: 403 }
          )
        }
      }
    }

    // Validate role if provided
    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'FACULTY']
    if (role !== undefined && !validRoles.includes(role)) {
      return NextResponse.json(apiError('Invalid role'), { status: 400 })
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

    if (body.isApproved === true) {
      await createNotification({
        userId: user.id,
        title: "Account Approved",
        message: "Your account has been approved. You can now access the system.",
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
