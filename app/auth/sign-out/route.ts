import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Back to the public landing page (not straight to sign-in), using the
  // request origin so any dev port works.
  const url = new URL('/', request.url)
  return NextResponse.redirect(url, { status: 302 })
}
