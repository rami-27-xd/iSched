"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { safeFetch } from "@/lib/api-client"

// Alias for backward compat within this file
const apiFetch = safeFetch

// ─── Departments ─────────────────────────────────────────────────────────────

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => apiFetch<any[]>("/api/departments"),
  })
}

// ─── Buildings ───────────────────────────────────────────────────────────────

export function useBuildings() {
  return useQuery({
    queryKey: ["buildings"],
    queryFn: () => apiFetch<any[]>("/api/buildings"),
    staleTime: 0,
    refetchOnMount: "always" as const,
  })
}

export function useCreateBuilding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/api/buildings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buildings"] })
      // A building's department restrictions decide which rooms /api/rooms returns
      // for a department, so every room list downstream (schedule Add Entry included)
      // is stale the moment a building changes.
      queryClient.invalidateQueries({ queryKey: ["rooms"] })
      toast.success("Building created")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateBuilding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/api/buildings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buildings"] })
      queryClient.invalidateQueries({ queryKey: ["rooms"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── Semesters ────────────────────────────────────────────────────────────────

export function useSemesters() {
  return useQuery({
    queryKey: ["semesters"],
    queryFn: () => apiFetch<any[]>("/api/semesters"),
  })
}

// ─── Colleges ─────────────────────────────────────────────────────────────────

export function useColleges(_semester?: string) {
  // Semester filtering is now handled by the frontend curriculum map,
  // not the API — all subjects are fetched and placed per program/year/semester
  return useQuery({
    queryKey: ["colleges"],
    queryFn: () => apiFetch<any[]>("/api/colleges"),
  })
}

// ─── Subjects ─────────────────────────────────────────────────────────────────

export function useSubjects(params?: { departmentId?: string; type?: string; semester?: string; enabled?: boolean }) {
  const { enabled, ...filterParams } = params ?? {}
  const query = new URLSearchParams()
  if (filterParams.departmentId) query.set("departmentId", filterParams.departmentId)
  if (filterParams.type) query.set("type", filterParams.type)
  if (filterParams.semester) query.set("semester", filterParams.semester)

  return useQuery({
    queryKey: ["subjects", filterParams],
    queryFn: () => apiFetch<any[]>(`/api/subjects?${query}`),
    staleTime: 0,
    refetchOnMount: "always" as const,
    enabled: enabled ?? true,
  })
}

export function useCreateSubject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] })
      queryClient.invalidateQueries({ queryKey: ["colleges"] })
      toast.success("Subject created")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateSubject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/subjects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] })
      queryClient.invalidateQueries({ queryKey: ["colleges"] })
      toast.success("Subject updated")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteSubject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/subjects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] })
      queryClient.invalidateQueries({ queryKey: ["colleges"] })
      toast.success("Subject deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export function useSections(params?: { programId?: string; yearLevelId?: string; enabled?: boolean }) {
  const { enabled, ...filterParams } = params ?? {}
  const query = new URLSearchParams()
  if (filterParams.programId) query.set("programId", filterParams.programId)
  if (filterParams.yearLevelId) query.set("yearLevelId", filterParams.yearLevelId)

  return useQuery({
    queryKey: ["sections", filterParams],
    queryFn: () => apiFetch<any[]>(`/api/sections?${query}`),
    staleTime: 0,
    refetchOnMount: "always" as const,
    enabled: enabled ?? true,
  })
}

export function useCreateSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections"] })
      queryClient.invalidateQueries({ queryKey: ["colleges"] })
      toast.success("Section created")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/sections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections"] })
      queryClient.invalidateQueries({ queryKey: ["colleges"] })
      toast.success("Section updated")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/sections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections"] })
      queryClient.invalidateQueries({ queryKey: ["colleges"] })
      toast.success("Section deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── Users ───────────────────────────────────────────────────────────────────

export function useUsers(params?: { approved?: boolean }) {
  const query = new URLSearchParams()
  if (params?.approved) query.set("approved", "true")
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => apiFetch<any[]>(`/api/users?${query}`),
  })
}

// ─── Faculty ──────────────────────────────────────────────────────────────────

export function useFacultyList(params?: { departmentId?: string; collegeId?: string }) {
  const query = new URLSearchParams()
  if (params?.departmentId) query.set("departmentId", params.departmentId)
  if (params?.collegeId) query.set("collegeId", params.collegeId)

  return useQuery({
    queryKey: ["faculty", params],
    queryFn: () => apiFetch<any[]>(`/api/faculty?${query}`),
  })
}

export function useCreateFaculty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/api/faculty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faculty"] })
      toast.success("Faculty added")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateFaculty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/faculty/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faculty"] })
      toast.success("Faculty updated")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteFaculty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/faculty/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faculty"] })
      toast.success("Faculty removed")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export function useRoomList(params?: { type?: string; buildingId?: string }) {
  const query = new URLSearchParams()
  if (params?.type) query.set("type", params.type)
  if (params?.buildingId) query.set("buildingId", params.buildingId)

  return useQuery({
    queryKey: ["rooms", params],
    queryFn: () => apiFetch<any[]>(`/api/rooms?${query}`),
    staleTime: 0,
    refetchOnMount: "always" as const,
  })
}

export function useCreateRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] })
      queryClient.invalidateQueries({ queryKey: ["buildings"] })
      toast.success("Room created")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/rooms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] })
      queryClient.invalidateQueries({ queryKey: ["buildings"] })
      toast.success("Room updated")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/rooms/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] })
      toast.success("Room deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      apiFetch<{ notifications: any[]; unreadCount: number }>(
        "/api/notifications"
      ),
    refetchInterval: 30_000, // poll every 30s
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { notificationId?: string; markAll?: boolean }) =>
      apiFetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      // refetchType "all" so the badge updates even if the popover has closed and
      // its query observer is no longer mounted.
      await queryClient.invalidateQueries({ queryKey: ["notifications"], refetchType: "all" })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () =>
      apiFetch<{
        stats: {
          activeSchedules: number
          totalFaculty: number
          availableRooms: number
          conflictsDetected: number
          unassignedSubjects: number
        }
        recentSchedules: any[]
        userRole?: string
      }>("/api/analytics/dashboard"),
    staleTime: 60_000,
  })
}
