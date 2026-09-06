import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, getUserDepartmentId } from '@/lib/auth'
import { apiResponse, apiError, handleApiError } from '@/lib/api-helpers'

// GET /api/users — SUPER_ADMIN sees all; ADMIN sees their department only
export async function GET(request: NextRequest) {
  try {
    const dbUser = await getCurrentUser()
    if (!dbUser || !['SUPER_ADMIN', 'ADMIN'].includes(dbUser.role)) {
      return NextResponse.json(apiError('Unauthorized'), { status: 403 })
    }

    const isSuperAdmin = dbUser.role === 'SUPER_ADMIN'
    const callerDeptId = getUserDepartmentId(dbUser)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') ?? ''
    const roleFilter = searchParams.get('role') ?? ''
    const approvedFilter = searchParams.get('approved') // 'true' | 'false' | null

    const where: Record<string, unknown> = {}

    // ADMIN (Program Chair): scope to their department only
    if (!isSuperAdmin && callerDeptId) {
      where.departmentId = callerDeptId
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    // User Management is the RBAC screen: only login-capable accounts belong
    // here (Department Chair / Program Chair). Faculty are record-only stubs
    // that cannot sign in — they're managed on the Faculty page instead.
    if (roleFilter && roleFilter !== 'all' && roleFilter !== 'FACULTY') {
      where.role = roleFilter
    } else {
      where.role = { in: ['SUPER_ADMIN', 'ADMIN'] }
    }

    if (approvedFilter === 'true') {
      where.isApproved = true
    } else if (approvedFilter === 'false') {
      where.isApproved = false
    }

    const users = await db.user.findMany({
      where,
      orderBy: [{ isApproved: 'asc' }, { createdAt: 'desc' }],
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
        clusterId: true,
        cluster: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, abbreviation: true } },
        faculty: { select: { id: true, department: { select: { id: true, name: true, abbreviation: true } } } },
        departmentChair: { select: { department: { select: { id: true, name: true, abbreviation: true } } } },
        programHead: { select: { programId: true, program: { select: { id: true, name: true, abbreviation: true, department: { select: { id: true, name: true, abbreviation: true } } } } } },
      },
    })

    const usersWithDept = users.map((u) => {
      const dept =
        u.department ??
        u.departmentChair?.department ??
        u.programHead?.program?.department ??
        u.faculty?.department ??
        null
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isApproved: u.isApproved,
        isActive: u.isActive,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        clusterId: u.clusterId,
        cluster: u.cluster ?? null,
        department: dept,
        programHead: u.programHead ?? null,
        faculty: u.faculty ? { id: u.faculty.id } : null,
      }
    })

    return NextResponse.json(apiResponse(usersWithDept))
  } catch (error) {
    const err = handleApiError(error)
    const status = err.error === 'Unauthorized' ? 403 : 500
    return NextResponse.json(err, { status })
  }
}
