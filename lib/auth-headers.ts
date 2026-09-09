/**
 * Request headers the proxy (proxy.ts → lib/supabase/middleware.ts) uses to hand
 * the already-validated Supabase identity to route handlers and server
 * components, so they don't each repeat the same getUser() network call.
 *
 * Kept in their own module because the proxy runs on the edge runtime and must
 * not pull in lib/auth.ts (Prisma).
 *
 * Trust note: the proxy deletes both headers from every request it forwards
 * before setting them, and its matcher covers every route these are read on, so
 * a client cannot inject a value.
 */
export const AUTH_USER_ID_HEADER = 'x-isched-auth-uid'
export const AUTH_EMAIL_HEADER = 'x-isched-auth-email'
