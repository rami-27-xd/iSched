/**
 * Client-side API fetch helper with resilient error handling.
 * Handles HTML redirects (session expired), network errors, and non-JSON responses.
 */

// Default abort timeout for client-side fetches. Prevents a hung server (e.g. an
// exhausted DB connection pool) from leaving the caller's mutation/query pending forever.
export const DEFAULT_FETCH_TIMEOUT_MS = 25_000

// Schedule generation is the one endpoint that legitimately runs for a long time:
// lib/services/scheduler.ts gives its greedy pass a hard 40 s deadline of its own,
// and the route still has to load its inputs and write every entry around that. The
// 25 s default aborted mid-run and reported "Request timed out" for work the server
// was about to finish successfully — so generation gets its own, larger budget,
// comfortably above the engine's ceiling.
export const GENERATE_FETCH_TIMEOUT_MS = 120_000

export async function safeFetch<T = any>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    // cache: "no-store" is deliberate. The proxy returns early for /api/* routes
    // (see lib/supabase/middleware.ts) so API responses never receive the
    // Cache-Control: no-store header the page routes get, which left the browser
    // free to replay a cached GET. "Mark all read" was the visible symptom: the
    // PATCH committed, the refetch was served from cache, and the unread badge
    // stayed put — the action looked like it had done nothing.
    res = await fetch(url, {
      ...options,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    })
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.")
    }
    throw new Error("Network error — could not reach the server.")
  } finally {
    clearTimeout(timeoutId)
  }

  // A redirect (middleware sending us to /sign-in) means the session actually
  // expired. An HTML response with NO redirect means the requested URL itself
  // errored (a crash / dev-mode error overlay / proxy timeout page) — that's a
  // server error, not an auth issue, and mislabeling it as "session expired" hides
  // the real problem.
  if (res.redirected) {
    throw new Error("Session expired. Please sign in again.")
  }
  if (res.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`Server error (status ${res.status}). Please try again in a moment.`)
  }

  let json: any
  try {
    json = await res.json()
  } catch {
    throw new Error(`Server error (status ${res.status}).`)
  }

  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  // TanStack Query v5 forbids undefined — always return a value
  return (json.data ?? []) as T
}

/** @deprecated Use safeFetch instead */
export async function apiFetch(url: string, options?: RequestInit) {
  return safeFetch(url, options)
}
