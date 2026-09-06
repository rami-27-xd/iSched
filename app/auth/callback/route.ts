import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureDbUser } from '@/lib/auth'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Forwarded from sign-up page for Google OAuth: role + optional department/program
  const role = searchParams.get('role')
  const departmentId = searchParams.get('department_id')
  const programId = searchParams.get('program_id')

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`)
  }

  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !session) {
    console.error('[auth/callback] exchangeCodeForSession error:', error?.message)
    return NextResponse.redirect(`${origin}/sign-in?error=auth_failed`)
  }

  // For Google sign-up: persist the chosen role and department into Supabase user_metadata
  // so that ensureDbUser() can read them when creating the DB record.
  if (role) {
    await supabase.auth.updateUser({
      data: {
        requested_role: role,
        ...(departmentId ? { department_id: departmentId } : {}),
        ...(programId ? { program_id: programId } : {}),
      },
    })
  }

  // Re-fetch the user so we have the latest metadata (including the role we just set).
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    try {
      await ensureDbUser(user)
    } catch (err) {
      console.error('[auth/callback] ensureDbUser error:', err)
      // Don't block sign-in — the user can still be redirected and the DB record
      // will be created on the next authenticated API call that checks.
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
