import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureDbUser } from '@/lib/auth'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const searchParams = url.searchParams
  const code = searchParams.get('code')

  // Behind Vercel's proxy, request.url carries the internal host, so redirecting
  // to its origin sent the browser somewhere that isn't the site the user is on —
  // OAuth then "worked" locally and dead-ended in production. Trust the forwarded
  // headers the platform sets, and only fall back to the raw origin locally.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin

  // Forwarded from sign-up page for Google OAuth: role + optional department/program
  const role = searchParams.get('role')
  const departmentId = searchParams.get('department_id')
  const programId = searchParams.get('program_id')

  // Google/Supabase report a refused or cancelled consent by redirecting back here
  // with ?error=..., not with a code. Reporting that as "missing_code" told the user
  // the wrong thing, so pass the real reason through to the sign-in page.
  const providerError = searchParams.get('error')
  const providerErrorDescription = searchParams.get('error_description')
  if (providerError) {
    console.error('[auth/callback] provider error:', providerError, providerErrorDescription)
    const params = new URLSearchParams({ error: 'provider_error' })
    if (providerErrorDescription) params.set('error_description', providerErrorDescription)
    return NextResponse.redirect(`${origin}/sign-in?${params.toString()}`)
  }

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
