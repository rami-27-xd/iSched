'use client'

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Validate before constructing the client.
  // A missing/empty env var produces an invalid URL which causes every
  // auth call (signInWithPassword, signUp, etc.) to throw "Fetching Failed".
  if (!url || !key) {
    throw new Error(
      'Supabase environment variables are not configured.\n' +
      'Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env file, ' +
      'then restart the dev server.'
    )
  }

  return createBrowserClient(url, key)
}
