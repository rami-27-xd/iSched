import { cache } from 'react'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { notifyDepartmentDeans } from '@/lib/notifications'
import { AUTH_EMAIL_HEADER, AUTH_USER_ID_HEADER } from '@/lib/auth-headers'
import { ROLE_LABELS, SELF_REGISTER_ROLES, isSingletonRole, type UserRole } from '@/lib/roles'

export type { UserRole }

/** The identity every route needs: who is signed in. */
export type AuthIdentity = { id: string; email: string | null }

/**
 * supabase.auth.getUser() over the network. Deliberately private and cached —
 * this is the expensive call the rest of this module exists to avoid making
 * more than once.
 */
const fetchAuthUserFromSupabase = cache(async (): Promise<SupabaseUser | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * Who is signed in, without a network round-trip.
 *
 * The proxy already called getUser() for this request and forwarded the verified
 * id/email as request headers (lib/supabase/middleware.ts), so reading them here
 * is both authoritative and free. Every API route used to repeat that call
 * twice — once for its own guard, once inside getCurrentUser() — which on a
 * deployed app meant two extra Supabase round-trips per request, times ten or
 * more requests per page.
 *
 * Falls back to the real call when the header is absent (a context the proxy
 * doesn't cover), and is request-cached either way.
 */
export const getAuthenticatedUser = cache(async (): Promise<AuthIdentity | null> => {
  try {
    const h = await headers()
    const id = h.get(AUTH_USER_ID_HEADER)
    if (id) return { id, email: h.get(AUTH_EMAIL_HEADER) }
  } catch {
    // headers() is unavailable outside a request scope — fall through.
  }
  const user = await fetchAuthUserFromSupabase()
  return user ? { id: user.id, email: user.email ?? null } : null
})

const CURRENT_USER_INCLUDE = {
  department: { include: { college: true } },
  faculty: { include: { department: { include: { college: true } } } },
  departmentChair: { include: { department: { include: { college: true } } } },
  programHead: { include: { program: { include: { department: { include: { college: true } } } } } },
} as const

export const getCurrentUser = cache(async () => {
  const identity = await getAuthenticatedUser()
  if (!identity) return null

  const existing = await db.user.findUnique({
    where: { supabaseId: identity.id },
    include: CURRENT_USER_INCLUDE,
  })
  if (existing) return existing

  // Self-heal: Supabase auth user exists but DB record is missing (e.g. callback was
  // missed during email confirmation). Create the record now so the user isn't locked
  // out. ensureDbUser reads user_metadata (names, requested role, department), which
  // the forwarded headers don't carry — so this rare path takes the full record.
  try {
    const fullUser = await fetchAuthUserFromSupabase()
    if (!fullUser) return null
    await ensureDbUser(fullUser)
    return db.user.findUnique({ where: { supabaseId: fullUser.id }, include: CURRENT_USER_INCLUDE })
  } catch {
    return null
  }
})

/** Get the department ID for the current user based on their role */
export function getUserDepartmentId(dbUser: any): string | null {
  if (!dbUser) return null
  // Direct departmentId on User model — the only source for DEAN (their own
  // department) and PATHFIT / NSTP (always CAS, where those subjects live).
  if (dbUser.departmentId) {
    return dbUser.departmentId
  }
  // SUPER_ADMIN (Department Chair) — from departmentChair relation
  if (dbUser.role === 'SUPER_ADMIN' && dbUser.departmentChair?.departmentId) {
    return dbUser.departmentChair.departmentId
  }
  // ADMIN (Program Chair) — from programHead → program → departmentId
  if (dbUser.role === 'ADMIN' && dbUser.programHead?.program?.departmentId) {
    return dbUser.programHead.program.departmentId
  }
  // FACULTY — from faculty relation
  if (dbUser.faculty?.departmentId) {
    return dbUser.faculty.departmentId
  }
  return null
}

/** Get the college ID for the current user, derived from their department. */
export async function getUserCollegeId(dbUser: any): Promise<string | null> {
  const departmentId = getUserDepartmentId(dbUser)
  if (!departmentId) return null
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { collegeId: true },
  })
  return department?.collegeId ?? null
}

/** True when every given department ID belongs to `collegeId`. Vacuously true for an empty list. */
export async function departmentIdsAllInCollege(deptIds: string[], collegeId: string): Promise<boolean> {
  if (deptIds.length === 0) return true
  const count = await db.department.count({ where: { id: { in: deptIds }, collegeId } })
  return count === deptIds.length
}

/**
 * Write-permission guard for a Building (and, by extension, the Rooms inside it):
 *   SUPER_ADMIN (Dept Chair) — any building.
 *   ADMIN (Program Chair) — only buildings whose current DepartmentBuilding links
 *     all resolve to the ADMIN's own college. A building with no links yet is
 *     shared/unassigned infrastructure and is treated as SUPER_ADMIN-only.
 * Note: DepartmentBuilding/DepartmentRoom/ProgramRoom otherwise represent *usage*
 * access (which departments/programs may be scheduled into a room) — that semantic
 * is untouched here. This helper reuses the same link data purely as the closest
 * available signal for *edit* ownership, since Building/Room have no dedicated
 * owning-college field in the schema.
 */
export async function canManageBuilding(dbUser: any, buildingId: string): Promise<boolean> {
  if (!dbUser) return false
  if (dbUser.role === 'SUPER_ADMIN') return true
  if (dbUser.role !== 'ADMIN') return false

  const adminCollegeId = await getUserCollegeId(dbUser)
  if (!adminCollegeId) return false

  const links = await db.departmentBuilding.findMany({
    where: { buildingId },
    select: { department: { select: { collegeId: true } } },
  })
  if (links.length === 0) return false

  return links.every((l) => l.department.collegeId === adminCollegeId)
}

/**
 * Does an approved, active account already hold this one-per-system role?
 * PATHFIT and NSTP are strictly single accounts (spec §4).
 */
export async function singletonRoleHolderExists(role: 'PATHFIT' | 'NSTP', excludeUserId?: string): Promise<boolean> {
  const n = await db.user.count({
    where: { role, isApproved: true, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
  })
  return n > 0
}

/** Does this department already have its (single) approved, active Dean? */
export async function departmentDeanExists(departmentId: string, excludeUserId?: string): Promise<boolean> {
  const n = await db.user.count({
    where: { role: 'DEAN', departmentId, isApproved: true, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
  })
  return n > 0
}

/**
 * Account-approval rules (spec §1 and §4):
 *   DEAN          — the FIRST Dean of a department is approved automatically (there
 *                   is nobody above them in the department to do it); a second Dean
 *                   for the same department is never approved — one Dean per dept.
 *   PATHFIT/NSTP  — exactly one account each, approved automatically; a second one
 *                   is never approved.
 *   SUPER_ADMIN   — bootstrap only: the very first Department Chair in an empty
 *                   system is approved automatically so the system can be set up.
 *                   After that they wait for the CAS Dean like everyone else.
 *   ADMIN         — always waits for their department's Dean.
 * Returns why an account is BLOCKED (can never be approved) so the UI can say so.
 */
export async function resolveAutoApproval(
  role: UserRole,
  departmentId: string | null,
  excludeUserId?: string
): Promise<{ approve: boolean; blocked?: string }> {
  if (role === 'DEAN') {
    if (!departmentId) return { approve: false, blocked: 'A Dean account must belong to a department.' }
    if (await departmentDeanExists(departmentId, excludeUserId)) {
      return { approve: false, blocked: 'This department already has a Dean — only one Dean account is allowed per department.' }
    }
    return { approve: true }
  }
  if (isSingletonRole(role)) {
    if (await singletonRoleHolderExists(role, excludeUserId)) {
      return { approve: false, blocked: `A ${ROLE_LABELS[role]} account already exists — only one is allowed.` }
    }
    return { approve: true }
  }
  if (role === 'SUPER_ADMIN') {
    const n = await db.user.count({ where: { role: 'SUPER_ADMIN', isApproved: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) } })
    return { approve: n === 0 }
  }
  return { approve: false }
}

export async function ensureDbUser(supabaseUser: SupabaseUser) {
  // Primary lookup by supabaseId, fallback to email to handle project migrations
  // and prevent duplicate records when supabaseId changes between Supabase projects.
  let existing = await db.user.findUnique({
    where: { supabaseId: supabaseUser.id },
    include: {
      department: true,
      faculty: { include: { department: true } },
      departmentChair: { include: { department: true } },
      programHead: { include: { program: { include: { department: true } } } },
    },
  })

  // Fallback: find by email if supabaseId doesn't match (e.g. after Supabase project switch)
  if (!existing && supabaseUser.email) {
    const byEmail = await db.user.findUnique({
      where: { email: supabaseUser.email },
      include: {
        department: true,
        faculty: { include: { department: true } },
        departmentChair: { include: { department: true } },
        programHead: { include: { program: { include: { department: true } } } },
      },
    })
    if (byEmail) {
      // Sync the supabaseId to the current auth user so future lookups work correctly
      existing = await db.user.update({
        where: { email: supabaseUser.email },
        data: { supabaseId: supabaseUser.id },
        include: {
          department: true,
          faculty: { include: { department: true } },
          departmentChair: { include: { department: true } },
          programHead: { include: { program: { include: { department: true } } } },
        },
      })
    }
  }

  if (existing) {
    // Not yet approved: honour a (possibly changed) requested role and re-check
    // whether the account now qualifies for automatic approval.
    const requestedRole = supabaseUser.user_metadata?.requested_role as UserRole | undefined
    const needsRoleUpdate =
      !!requestedRole && SELF_REGISTER_ROLES.includes(requestedRole) && !existing.isApproved && existing.role !== requestedRole

    const effectiveRole = (needsRoleUpdate ? requestedRole! : existing.role) as UserRole
    const shouldAutoApprove =
      !existing.isApproved &&
      (await resolveAutoApproval(effectiveRole, existing.departmentId ?? null, existing.id)).approve

    if (needsRoleUpdate || shouldAutoApprove) {
      return db.user.update({
        where: { supabaseId: supabaseUser.id },
        data: {
          ...(needsRoleUpdate ? { role: requestedRole } : {}),
          ...(shouldAutoApprove ? { isApproved: true } : {}),
        },
        include: {
          department: true,
          faculty: { include: { department: true } },
          departmentChair: { include: { department: true } },
          programHead: { include: { program: { include: { department: true } } } },
        },
      })
    }
    return existing
  }

  // New users take the role they asked for on the sign-up form (or FACULTY, which
  // can never sign in) and wait for their department's Dean — except the cases
  // resolveAutoApproval() approves on the spot.
  const requestedRole = supabaseUser.user_metadata?.requested_role as UserRole | undefined
  const role: UserRole = requestedRole && SELF_REGISTER_ROLES.includes(requestedRole) ? requestedRole : 'FACULTY'

  const firstName = supabaseUser.user_metadata?.first_name ?? supabaseUser.user_metadata?.full_name?.split(' ')[0] ?? ''
  const lastName = supabaseUser.user_metadata?.last_name ?? supabaseUser.user_metadata?.full_name?.split(' ').slice(1).join(' ') ?? ''

  let departmentId = supabaseUser.user_metadata?.department_id as string | undefined

  // Department Chairs (SUPER_ADMIN) aren't asked to pick a department at sign-up —
  // they all belong to the single CAS department (see CLAUDE.md org structure).
  // The PATHFit / NSTP coordinators live there too: those subjects are CAS rows.
  // Without this, getUserDepartmentId() silently breaks for them everywhere
  // (college scoping, cluster lookups, etc.).
  if ((role === 'SUPER_ADMIN' || isSingletonRole(role)) && !departmentId) {
    const casDept = await db.department.findFirst({ where: { abbreviation: 'CAS' } })
    departmentId = casDept?.id
  }

  const { approve: autoApprove } = await resolveAutoApproval(role, departmentId ?? null)

  const newUser = await db.user.create({
    data: {
      supabaseId: supabaseUser.id,
      email: supabaseUser.email ?? null,
      firstName,
      lastName,
      role,
      isApproved: autoApprove,
      ...(departmentId ? { departmentId } : {}),
    },
    include: {
      department: true,
      faculty: { include: { department: true } },
      departmentChair: { include: { department: true } },
      programHead: { include: { program: { include: { department: true } } } },
    },
  })

  // Auto-link FACULTY to their department by creating a faculty record
  if (role === 'FACULTY' && departmentId) {
    const deptExists = await db.department.findUnique({ where: { id: departmentId } })
    if (deptExists) {
      const existingFaculty = await db.faculty.findUnique({ where: { userId: newUser.id } })
      if (!existingFaculty) {
        await db.faculty.create({
          data: {
            userId: newUser.id,
            departmentId,
            employeeId: `FAC-${Date.now()}`,
          },
        })
      }
    }
  }

  // Auto-link ADMIN (Program Chair) to their department as faculty too
  if (role === 'ADMIN' && departmentId) {
    const deptExists = await db.department.findUnique({ where: { id: departmentId } })
    if (deptExists) {
      const existingFaculty = await db.faculty.findUnique({ where: { userId: newUser.id } })
      if (!existingFaculty) {
        await db.faculty.create({
          data: {
            userId: newUser.id,
            departmentId,
            employeeId: `FAC-${Date.now()}`,
          },
        })
      }
    }
  }

  // Record which program this Program Chairperson heads (chosen at sign-up).
  // ProgramHead.programId is unique — one chair per program — so a program
  // already claimed is left alone for the Dean to resolve when approving.
  const requestedProgramId = supabaseUser.user_metadata?.program_id as string | undefined
  if (role === 'ADMIN' && requestedProgramId) {
    const program = await db.program.findUnique({ where: { id: requestedProgramId } })
    if (program && (!departmentId || program.departmentId === departmentId)) {
      const taken = await db.programHead.findUnique({ where: { programId: requestedProgramId } })
      if (!taken) {
        await db.programHead.create({
          data: { userId: newUser.id, programId: requestedProgramId },
        }).catch((e) => {
          console.error('[ensureDbUser] programHead create failed:', e)
        })
      }
    }
  }

  // Tell the department's Dean there is an account waiting for them.
  if (!autoApprove && departmentId) {
    const deptName = (await db.department.findUnique({ where: { id: departmentId } }))?.name ?? ''
    await notifyDepartmentDeans(
      departmentId,
      "New User Registration",
      `${firstName} ${lastName} (${supabaseUser.email}) registered as ${ROLE_LABELS[role]}${deptName ? ` in ${deptName}` : ''} and is pending your approval.`,
      "user_registered",
      "/dashboard/users"
    ).catch(() => {}) // Don't block sign-in if notification fails
  }

  // Re-fetch with updated relations
  return db.user.findUnique({
    where: { id: newUser.id },
    include: {
      department: true,
      faculty: { include: { department: true } },
      departmentChair: { include: { department: true } },
      programHead: { include: { program: { include: { department: true } } } },
    },
  })
}

export async function requireRole(...roles: UserRole[]) {
  const user = await getCurrentUser()
  if (!user || !roles.includes(user.role as UserRole)) {
    throw new Error('UNAUTHORIZED')
  }
  return user
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>

export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'], // Department Chair — full access
  ADMIN: [            // Program Chair — manage major subjects, view schedules/rooms
    'schedule:read', 'schedule:create',
    'faculty:read',
    'room:read', 'subject:read', 'subject:manage',
    'section:read', 'section:manage',
    'analytics:read',
  ],
  FACULTY: [          // Record-only — cannot sign in
    'schedule:read:own',
    'availability:write:own',
  ],
  DEAN: [             // Read-only oversight of their department + account approval + logs
    'schedule:read', 'faculty:read', 'room:read', 'subject:read', 'section:read', 'analytics:read',
    'user:approve', 'logs:read',
  ],
  PATHFIT: ['schedule:read', 'schedule:create', 'room:read', 'subject:read', 'section:read'],
  NSTP:    ['schedule:read', 'schedule:create', 'room:read', 'subject:read', 'section:read'],
} as const

export function hasPermission(role: UserRole, permission: string): boolean {
  const perms: readonly string[] = ROLE_PERMISSIONS[role]
  return perms.includes('*') || perms.includes(permission)
}
