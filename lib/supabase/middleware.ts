import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_EMAIL_HEADER, AUTH_USER_ID_HEADER } from '@/lib/auth-headers'

/** Cookie names Supabase uses for the session (sb-<project-ref>-auth-token[.n]). */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
}

/**
 * Is this error proof the session is actually gone, or just a bad moment?
 *
 * getUser() calls Supabase over the network. A timeout, a 5xx, or a 429 from the
 * auth rate limiter all produce `user: null` — identical, from here, to "signed
 * out". Redirecting on those is what made clicking a tab bounce to /sign-in at
 * random: the session was fine, the round-trip wasn't.
 *
 * Only a 400/401/403 means the token itself was rejected.
 */
function isDefinitelySignedOut(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  if (typeof status !== 'number') return false // network / no response
  return status === 400 || status === 401 || status === 403
}

export async function updateSession(request: NextRequest) {
  // Cookies Supabase wants written are collected here and applied to whichever
  // response we end up returning. The previous version wrote them onto a
  // `next()` response that a later redirect threw away, so a refresh that
  // happened on the same request as a redirect (sign-in → /dashboard, most
  // visibly) silently lost the rotated tokens.
  const refreshedCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            refreshedCookies.push({ name, value, options: options as Record<string, unknown> })
          })
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Identity is forwarded to route handlers and server components so they don't
  // each repeat this same getUser() network call — see lib/auth.ts. Any value
  // the client tried to send is deleted first, so the only source is this
  // already-validated `user`.
  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.delete(AUTH_USER_ID_HEADER)
  forwardedHeaders.delete(AUTH_EMAIL_HEADER)
  if (user) {
    forwardedHeaders.set(AUTH_USER_ID_HEADER, user.id)
    if (user.email) forwardedHeaders.set(AUTH_EMAIL_HEADER, user.email)
  }

  const pass = () => {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } })
    refreshedCookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options as never))
    return res
  }

  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone()
    url.pathname = to
    url.search = ''
    const res = NextResponse.redirect(url)
    refreshedCookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options as never))
    return res
  }

  // API routes: refresh the session but never redirect — they return JSON errors.
  if (pathname.startsWith('/api/')) {
    return pass()
  }

  const isAuthRoute = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')

  const isPublicRoute =
    pathname === '/' ||
    isAuthRoute ||
    pathname.startsWith('/auth/callback') ||
    // Signing out must never be gated on being signed in. Without this, a POST to
    // /auth/sign-out from an already-expired session was redirected here with a 307,
    // which preserves the method — so the browser POSTed to /sign-in, a page with no
    // POST handler, and the user got a 405 error screen instead of the landing page.
    pathname.startsWith('/auth/sign-out') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')

  // Redirect unauthenticated users away from protected routes — but only when
  // they are genuinely unauthenticated. A session cookie plus a transient auth
  // failure is a bad round-trip, not a sign-out; let it through and let the page
  // decide (the dashboard layout shows a retry screen rather than a login form).
  if (!user && !isPublicRoute) {
    const transient = hasSessionCookie(request) && !isDefinitelySignedOut(error)
    if (!transient) return redirectTo('/sign-in')
  }

  // Prevent back-button access to auth pages after login
  if (user && isAuthRoute) {
    return redirectTo('/dashboard')
  }

  const res = pass()

  // Cache-control on protected routes so the back button can't show a stale
  // authenticated page after logout.
  if (!isPublicRoute) {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.headers.set('Pragma', 'no-cache')
    res.headers.set('Expires', '0')
  }

  return res
}
