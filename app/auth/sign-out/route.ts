import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Back to the public landing page (not straight to sign-in), using the
  // request origin so any dev port works.
  //
  // 303, not 302: this handler is reached by a form POST (the Sign Out button on
  // the pending-approval screen a user lands on right after signing up). A 302
  // leaves the method up to the browser, which re-issued the request to "/" as a
  // POST — and "/" is a page with no POST handler, so the user got a 405 error
  // screen instead of the landing page. 303 See Other requires the follow-up to
  // be a GET, which is exactly the POST-redirect-GET behaviour wanted here.
  const url = new URL('/', request.url)
  return NextResponse.redirect(url, { status: 303 })
}

// The same handler for GET, so a plain link to /auth/sign-out works too and can
// never dead-end on a 405.
export async function GET(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
