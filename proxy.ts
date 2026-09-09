import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

// Next.js 16 renamed the middleware.ts file convention to proxy.ts (the
// exported function is now `proxy`, not `middleware`). Staying on the old
// convention is deprecated, not yet removed — but it was producing exactly
// the symptom this file exists to fix: a user signs in, the dashboard loads
// fine (a full navigation, which definitely ran the deprecated middleware),
// then the FIRST client-side Link click (Faculty, Availability, …) bounced
// back to /sign-in. That is the "Logout Loop" pattern documented for this
// migration — the deprecated path does not reliably forward a refreshed
// session's Set-Cookie back to the browser on client-side (RSC) navigations,
// so getUser() in updateSession() sees a stale/expired token and treats the
// request as signed out even though the browser still holds a valid session.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     * - _next/static, _next/image (build assets)
     * - favicon.ico, images/, static files
     */
    '/((?!_next/static|_next/image|favicon.ico|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Listed again, deliberately: the proxy is what strips any client-supplied
    // x-isched-auth-* header before setting the real one (see
    // lib/supabase/middleware.ts). Every route that trusts those headers must be
    // guaranteed to pass through here, with no chance of the exclusion pattern
    // above letting one slip past.
    '/api/:path*',
  ],
}
