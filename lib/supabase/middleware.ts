import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // API routes: refresh session but never redirect — they return JSON errors
  const isApiRoute = pathname.startsWith('/api/')
  if (isApiRoute) {
    return supabaseResponse
  }

  const isAuthRoute =
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')

  const isPublicRoute =
    pathname === '/' ||
    isAuthRoute ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')

  // Redirect unauthenticated users away from protected routes
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  // Prevent back-button access to auth pages after login
  // Authenticated users on sign-in/sign-up get redirected to dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Add cache-control headers on protected routes to prevent browser caching
  // This ensures the back button doesn't show stale authenticated pages after logout
  if (!isPublicRoute) {
    supabaseResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    supabaseResponse.headers.set('Pragma', 'no-cache')
    supabaseResponse.headers.set('Expires', '0')
  }

  // Pass pathname to downstream server components (used by layout role guard)
  supabaseResponse.headers.set('x-next-pathname', pathname)

  return supabaseResponse
}
