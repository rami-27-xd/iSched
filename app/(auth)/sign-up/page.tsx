'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CalendarDays, Loader2, ShieldCheck, Lock, Users, GraduationCap, Building2, Eye, EyeOff } from 'lucide-react'
import { passwordError } from '@/lib/password'
import { PasswordRequirements } from '@/components/shared/password-requirements'

const ALLOWED_ROLES: Record<string, { label: string; description: string }> = {
  ADMIN: { label: 'Program Chair', description: 'Manage major subjects and schedules per program' },
  SUPER_ADMIN: { label: 'Department Chair', description: 'Full system access — manage all schedules, faculty, and settings' },
}

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Role from URL — if present, it's locked
  const roleParam = searchParams.get('role')?.toUpperCase() ?? ''
  const urlRole = roleParam in ALLOWED_ROLES ? roleParam : ''

  const [selectedRole, setSelectedRole] = useState(urlRole || '')
  const hasLockedRole = !!urlRole
  const role = hasLockedRole ? urlRole : selectedRole
  const roleInfo = ALLOWED_ROLES[role]

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  // Program a Program Chairperson heads — scopes the majors they schedule.
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [departments, setDepartments] = useState<any[]>([])
  const [loadingDepts, setLoadingDepts] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  // Whether an approved Department Chair already exists. When none does, the
  // first person to register as Department Chair is auto-approved (no approver
  // needed) — see ensureDbUser() bootstrap in lib/auth.ts. Default true so we
  // never over-promise before the check resolves.
  const [superAdminExists, setSuperAdminExists] = useState(true)

  useEffect(() => {
    fetch('/api/auth/bootstrap-status')
      .then((res) => res.json())
      .then((json) => setSuperAdminExists(json.data?.superAdminExists ?? true))
      .catch(() => setSuperAdminExists(true))
  }, [])

  // This registration will be auto-approved only if it's the first Department Chair.
  const willAutoApprove = role === 'SUPER_ADMIN' && !superAdminExists

  // Show department + program selectors for ADMIN (Program Chair) only
  const needsDepartment = role === 'ADMIN'

  // Programs belonging to the chosen department.
  const programsForDept: any[] =
    (departments as any[]).find((d: any) => d.id === selectedDepartmentId)?.programs ?? []

  // Fetch departments when role needs it
  useEffect(() => {
    if (!needsDepartment) {
      setDepartments([])
      return
    }
    setLoadingDepts(true)
    fetch('/api/departments/public')
      .then((res) => res.json())
      .then((json) => {
        setDepartments(json.data ?? [])
        setLoadingDepts(false)
      })
      .catch(() => {
        setDepartments([])
        setLoadingDepts(false)
      })
  }, [needsDepartment])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!role || !(role in ALLOWED_ROLES)) {
      setError('Please select a role.')
      return
    }

    if (needsDepartment && !selectedDepartmentId) {
      setError('Please select your department.')
      return
    }

    if (needsDepartment && !selectedProgramId) {
      setError('Please select the program you chair.')
      return
    }

    const pwError = passwordError(password)
    if (pwError) {
      setError(pwError)
      return
    }

    setLoading(true)

    let supabase
    try {
      supabase = createClient()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Without this, the confirmation link falls back to the project's
        // configured Site URL — which breaks the link when the app is served
        // from a different host/port than that setting.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
          requested_role: role,
          department_id: needsDepartment ? selectedDepartmentId : undefined,
          program_id: needsDepartment ? selectedProgramId : undefined,
        },
      },
    })

    if (error) {
      // Give a clear message for the most common error — duplicate email
      if (
        error.message.toLowerCase().includes('already registered') ||
        error.message.toLowerCase().includes('already been registered') ||
        error.message.toLowerCase().includes('user already exists') ||
        error.message.toLowerCase().includes('email address is already')
      ) {
        setError('An account with this email already exists. Please sign in instead.')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  async function handleGoogleSignUp() {
    if (!role || !(role in ALLOWED_ROLES)) {
      setError('Please select a role first.')
      return
    }
    if (needsDepartment && !selectedDepartmentId) {
      setError('Please select your department first.')
      return
    }
    if (needsDepartment && !selectedProgramId) {
      setError('Please select the program you chair first.')
      return
    }
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?role=${role}&department_id=${selectedDepartmentId}&program_id=${selectedProgramId}`,
      },
    })
  }

  if (success) {
    const deptName = departments.find((d: any) => d.id === selectedDepartmentId)?.name
    const programName = programsForDept.find((p: any) => p.id === selectedProgramId)?.name
    return (
      <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/[0.04]" />
          <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/[0.04]" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent" />
        </div>
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-[#D4AF37] mb-4">
            <ShieldCheck className="h-7 w-7 text-[#1B4332]" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {willAutoApprove ? 'Account Created' : 'Registration Submitted'}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            We sent a confirmation link to <strong className="text-white">{email}</strong>.
          </p>
          <div className="mt-4 rounded-lg bg-white/10 border border-white/20 p-4 space-y-2">
            {willAutoApprove ? (
              <p className="text-sm text-white/80">
                You are the first <strong className="text-[#D4AF37]">Department Chair</strong>, so your account is
                {' '}<strong className="text-[#D4AF37]">approved automatically</strong> — no one else needs to approve it.
                Confirm your email, then sign in.
              </p>
            ) : (
              <>
                <p className="text-sm text-white/80">
                  Your account will be flagged as <strong className="text-[#D4AF37]">Pending Approval</strong>.
                  A Department Chair (Super Admin) must approve your account before you can access the system.
                </p>
                {deptName && (
                  <p className="text-xs text-white/60">
                    Department: <strong className="text-[#D4AF37]">{deptName}</strong>
                  </p>
                )}
                {programName && (
                  <p className="text-xs text-white/60">
                    Program: <strong className="text-[#D4AF37]">{programName}</strong>
                  </p>
                )}
              </>
            )}
          </div>
          <Link
            href="/sign-in"
            className="mt-6 inline-block rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#1B4332] transition-colors hover:bg-[#F0D060]"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/[0.04]" />
        <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/[0.04]" />
        <div className="absolute top-1/4 right-12 h-48 w-48 rounded-full border border-white/[0.07]" />
        <div className="absolute bottom-1/3 left-10 h-28 w-28 rounded-full border border-white/[0.07]" />
        <div className="absolute top-1/3 left-1/4 h-2 w-2 rounded-full bg-[#D4AF37]/50" />
        <div className="absolute top-2/3 right-1/3 h-3 w-3 rounded-full bg-[#D4AF37]/30" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent" />
      </div>
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37] mb-4">
            <CalendarDays className="h-6 w-6 text-[#1B4332]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="mt-1 text-sm text-white/60">Join iSched to get started</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-xl">
          <button
            type="button"
            onClick={handleGoogleSignUp}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                  required
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && <PasswordRequirements password={password} />}
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {hasLockedRole ? 'Registering as' : 'Select your role'}
              </label>

              {hasLockedRole ? (
                <div className="flex items-center gap-3 rounded-lg border border-[#1B4332] bg-[#1B4332]/5 p-3 ring-1 ring-[#1B4332]">
                  <Lock className="h-4 w-4 text-[#1B4332] shrink-0" />
                  <div>
                    <span className="text-sm font-semibold text-[#1B4332]">{roleInfo?.label}</span>
                    <p className="text-xs text-gray-500">{roleInfo?.description}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedRole === 'ADMIN'
                        ? 'border-[#1B4332] bg-[#1B4332]/5 ring-1 ring-[#1B4332]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="ADMIN"
                      checked={selectedRole === 'ADMIN'}
                      onChange={() => { setSelectedRole('ADMIN'); setSelectedDepartmentId('') }}
                      className="mt-0.5 accent-[#1B4332]"
                    />
                    <div className="flex items-start gap-2">
                      <GraduationCap className="h-4 w-4 text-[#1B4332] mt-0.5 shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-gray-800">Program Chair</span>
                        <p className="text-xs text-gray-500">Manage major subjects and schedules per program</p>
                      </div>
                    </div>
                  </label>
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedRole === 'SUPER_ADMIN'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 ring-1 ring-[#D4AF37]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="SUPER_ADMIN"
                      checked={selectedRole === 'SUPER_ADMIN'}
                      onChange={() => { setSelectedRole('SUPER_ADMIN'); setSelectedDepartmentId('') }}
                      className="mt-0.5 accent-[#D4AF37]"
                    />
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="h-4 w-4 text-[#D4AF37] mt-0.5 shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-gray-800">Department Chair</span>
                        <p className="text-xs text-gray-500">Full system access — manage all schedules, faculty, and settings</p>
                      </div>
                    </div>
                  </label>
                </div>
              )}

              <p className="mt-1.5 text-xs text-amber-600">
                {willAutoApprove
                  ? 'You will be the first Department Chair — your account is approved automatically, no approval needed.'
                  : selectedRole === 'SUPER_ADMIN'
                  ? 'A Department Chair already exists, so additional Department Chair accounts require approval.'
                  : 'All accounts require Department Chair approval before access is granted.'}
              </p>
            </div>

            {/* Department Selection — shown for Program Chair and Faculty */}
            {needsDepartment && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                  Department
                </label>
                {loadingDepts ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading departments...
                  </div>
                ) : departments.length === 0 ? (
                  <p className="text-xs text-gray-500 py-1">No departments available. Contact your administrator.</p>
                ) : (
                  <select
                    value={selectedDepartmentId}
                    onChange={(e) => { setSelectedDepartmentId(e.target.value); setSelectedProgramId('') }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                    required
                  >
                    <option value="">Select your department...</option>
                    {departments.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.college?.abbreviation ? `(${d.college.abbreviation})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  {role === 'ADMIN'
                    ? 'You will only see schedules, faculty, and data from this department.'
                    : 'Your schedule and availability will be linked to this department.'}
                </p>
              </div>
            )}

            {/* Program Selection — which program this Program Chairperson heads */}
            {needsDepartment && selectedDepartmentId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <GraduationCap className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                  Program you chair
                </label>
                {programsForDept.length === 0 ? (
                  <p className="text-xs text-gray-500 py-1">
                    No programs listed for this department. Contact your Department Chairperson.
                  </p>
                ) : (
                  <select
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                    required
                  >
                    <option value="">Select your program...</option>
                    {programsForDept.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  This is the program whose major subjects you will add and schedule.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2D6A4F] disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-white/60">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-[#D4AF37] hover:text-[#F0D060]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1B4332] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
      </div>
    }>
      <SignUpForm />
    </Suspense>
  )
}
