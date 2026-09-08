import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { safeFetch, DEFAULT_FETCH_TIMEOUT_MS, GENERATE_FETCH_TIMEOUT_MS } from "@/lib/api-client"

// ─── Safe raw fetch that handles HTML redirects / non-JSON ───────────────────
// Aborts after DEFAULT_FETCH_TIMEOUT_MS so a hung server request (e.g. pool
// exhaustion) rejects instead of leaving the caller's mutation pending forever.
async function rawFetch(url: string, options?: RequestInit, timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(url, { ...options, redirect: "follow", signal: controller.signal })
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.")
    }
    throw new Error("Network error — could not reach the server.")
  } finally {
    clearTimeout(timeoutId)
  }
  // A redirect (to /sign-in) means the session actually expired. An HTML response
  // with NO redirect means the requested URL itself errored (a crash / dev-mode
  // error overlay / proxy timeout page) — that's a server error, not an auth issue,
  // and mislabeling it as "session expired" hides the real problem from both the
  // user and whoever's debugging it.
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
  return { res, json }
}

// ---------- Fetch schedules list ----------
// Live multi-user updates come from the Supabase Realtime subscription
// (hooks/use-realtime.ts), which invalidates this query key on any Schedule/
// ScheduleEntry change — the interval below is just a safety-net fallback,
// not the primary update mechanism, so it can be slow.
export function useSchedules(semesterId?: string, isArchived = false, collegeId?: string | null, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["schedules", { semesterId, isArchived, collegeId }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (semesterId) params.set("semesterId", semesterId)
      if (isArchived) params.set("isArchived", "true")
      if (collegeId) params.set("collegeId", collegeId)
      return safeFetch<any[]>(`/api/schedules?${params}`)
    },
    staleTime: 10_000,
    refetchInterval: 120_000, // safety-net only — realtime invalidation handles live updates
    refetchIntervalInBackground: false, // Only poll when tab is active
    enabled: opts?.enabled ?? true,
  })
}

// ---------- Fetch single schedule with entries ----------
export function useSchedule(scheduleId: string | null) {
  return useQuery({
    queryKey: ["schedules", scheduleId],
    queryFn: async () => {
      if (!scheduleId) return null
      return safeFetch<any>(`/api/schedules/${scheduleId}`)
    },
    enabled: !!scheduleId,
    staleTime: 10_000, // was 0 — re-selecting an already-viewed schedule now serves cache instead of refetching
    refetchInterval: 120_000, // safety-net only — realtime invalidation (use-realtime.ts) handles live updates
    refetchIntervalInBackground: false,
  })
}

// ---------- Generate schedule ----------
export function useGenerateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      // Generation runs far longer than a normal request — the engine alone budgets
      // 40 s. With the 25 s default this aborted mid-run and surfaced "Request timed
      // out" while the server carried on and finished the work.
      const { res, json } = await rawFetch(`/api/schedules/${scheduleId}/generate`, {
        method: "POST",
      }, GENERATE_FETCH_TIMEOUT_MS)
      if (!res.ok || json.error || json.success === false) {
        const err = new Error(json.error ?? `Server error (${res.status})`) as Error & { details?: string[] }
        err.details = json.details ?? []
        throw err
      }
      return json.data
    },
    onSuccess: (_data, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ["schedules", scheduleId] })
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
    },
  })
}

// ---------- Update schedule status ----------
export function useUpdateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ scheduleId, status }: { scheduleId: string; status: string }) => {
      const { json } = await rawFetch(`/api/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (json.error) throw new Error(json.error)
      return json.data
    },
    onSuccess: (_data, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ["schedules", scheduleId] })
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
    },
  })
}

// ---------- Archive/unarchive schedule ----------
// Correct the semester / school year / dates on a DRAFT schedule, so a typo does
// not mean deleting the schedule and re-entering everything.
export function useUpdateScheduleTerm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      scheduleId: string
      semesterType: string
      schoolYear: string
      startDate: string
      endDate: string
    }) => {
      const { scheduleId, ...rest } = vars
      const { json } = await rawFetch(`/api/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-term", ...rest }),
      })
      if (json.error) throw new Error(json.error)
      return json.data
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      queryClient.invalidateQueries({ queryKey: ["schedules", vars.scheduleId] })
    },
  })
}

export function useArchiveSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ scheduleId, action }: { scheduleId: string; action: "archive" | "unarchive" }) => {
      const { json } = await rawFetch(`/api/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (json.error) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
    },
  })
}

// ---------- Delete schedule ----------
export function useDeleteSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const { json } = await rawFetch(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
      })
      if (json.error) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
    },
  })
}

// ---------- Update schedule entry ----------
export function useUpdateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ scheduleId, entryId, changes }: { scheduleId: string; entryId: string; changes: Record<string, unknown> }) => {
      const { json } = await rawFetch(`/api/schedules/${scheduleId}/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      })
      if (json.error) throw new Error(json.error)
      // warning is returned when force:true bypassed a constraint
      return { data: json.data, warning: (json.warning as string) ?? null }
    },
    onSuccess: (_data, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ["schedules", scheduleId] })
    },
  })
}

// ---------- Delete schedule entry ----------
export function useDeleteEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ scheduleId, entryId }: { scheduleId: string; entryId: string }) => {
      const { json } = await rawFetch(`/api/schedules/${scheduleId}/entries/${entryId}`, {
        method: "DELETE",
      })
      if (json.error) throw new Error(json.error)
      return json.data
    },
    onSuccess: (_data, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ["schedules", scheduleId] })
    },
  })
}

// ---------- Publish schedule ----------
export function usePublishSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const { res, json } = await rawFetch(`/api/schedules/${scheduleId}/publish`, {
        method: "POST",
      })
      if (!res.ok && json.data) {
        // 422 with conflict data
        return { ...json.data, _status: res.status }
      }
      if (json.error) throw new Error(json.error)
      return json.data
    },
    onSuccess: (_data, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ["schedules", scheduleId] })
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
    },
  })
}

// ---------- Unpublish schedule ----------
export function useUnpublishSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const { json } = await rawFetch(`/api/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpublish" }),
      })
      if (json.error) throw new Error(json.error)
      return json.data
    },
    onSuccess: (_data, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ["schedules", scheduleId] })
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
    },
  })
}

// ---------- Create schedule ----------
export function useCreateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      semesterType: string
      schoolYear: string
      startDate?: string
      endDate?: string
      // Dept Chairs may create a schedule for any department (they plot GEC
      // first, so the schedule must exist before that dept's Program Chair
      // opens it). Ignored server-side for Program Chairs.
      departmentId?: string
    }) => {
      const { json } = await rawFetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (json.error) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
    },
  })
}

// ---------- Create schedule entry ----------
export function useCreateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ scheduleId, entry }: {
      scheduleId: string
      entry: {
        subjectId: string
        facultyId: string
        facultyName?: string | null  // free-text name override
        roomId: string
        sectionId: string
        // `days` (plural) creates one entry per day sharing a groupId — the
        // MWF/TTh/custom day-pattern picker in the Add Entry dialog. `day`
        // (singular) still works for a single-session entry.
        day?: string
        days?: string[]
        startTime: string
        endTime: string
        set?: string | null
      }
    }) => {
      const { res, json } = await rawFetch(`/api/schedules/${scheduleId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      })
      if (!res.ok || json.error) throw new Error(json.error ?? `Server error (${res.status})`)
      return json.data
    },
    onSuccess: (_data, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ["schedules", scheduleId] })
    },
  })
}

// ---------- Fetch faculty ----------
export function useFaculty(departmentId?: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["faculty", { departmentId }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (departmentId) params.set("departmentId", departmentId)
      return safeFetch<any[]>(`/api/faculty?${params}`)
    },
    staleTime: 0,
    refetchOnMount: "always" as const,
    enabled: opts?.enabled ?? true,
  })
}

// ---------- Fetch rooms ----------
export function useRooms(type?: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["rooms", { type }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (type) params.set("type", type)
      return safeFetch<any[]>(`/api/rooms?${params}`)
    },
    staleTime: 0,
    refetchOnMount: "always" as const,
    enabled: opts?.enabled ?? true,
  })
}
