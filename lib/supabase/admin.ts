import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase admin client (service role).
 * NEVER import this in client components or expose SUPABASE_SERVICE_ROLE_KEY
 * via NEXT_PUBLIC_* variables.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Add them to your .env file (never prefix the service key with NEXT_PUBLIC_).'
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
