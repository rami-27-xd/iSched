'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Supabase Realtime hook for live schedule updates.
 * Listens to INSERT/UPDATE/DELETE on ScheduleEntry and Schedule tables.
 * When a change is detected from another user, invalidates React Query cache
 * so the UI auto-refreshes without manual reload.
 */
export function useRealtimeSchedules(scheduleId?: string | null) {
  const queryClient = useQueryClient()
  const supabaseRef = useRef(createClient())
  // Read inside the callback via a ref rather than a useEffect dep — re-subscribing
  // the channel on every schedule selection would be its own source of churn.
  const scheduleIdRef = useRef(scheduleId)
  scheduleIdRef.current = scheduleId

  useEffect(() => {
    const supabase = supabaseRef.current

    // Channel for schedule entry changes (entries added/edited/deleted)
    const entryChannel = supabase
      .channel('schedule-entries-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'ScheduleEntry',
        },
        (payload) => {
          console.log('[Realtime] ScheduleEntry change:', payload.eventType)

          // Only invalidate the detail query if it's for the schedule this client
          // actually has open — every other client's edit shouldn't force a refetch
          // of a schedule nobody here is viewing.
          const changedScheduleId =
            (payload.new as any)?.scheduleId ||
            (payload.old as any)?.scheduleId

          if (changedScheduleId && changedScheduleId === scheduleIdRef.current) {
            queryClient.invalidateQueries({ queryKey: ['schedules', changedScheduleId] })
          }

          // Entry counts shown in the list view can change on any schedule, anywhere —
          // this one stays broad since ScheduleEntry has no direct department column
          // to scope a Postgres-changes filter on.
          queryClient.invalidateQueries({ queryKey: ['schedules'] })
        }
      )
      .subscribe()

    // Channel for schedule-level changes (status changes like DRAFT → PUBLISHED)
    const scheduleChannel = supabase
      .channel('schedules-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Schedule',
        },
        (payload) => {
          console.log('[Realtime] Schedule change:', payload.eventType)
          queryClient.invalidateQueries({ queryKey: ['schedules'] })

          const changedId = (payload.new as any)?.id || (payload.old as any)?.id
          if (changedId && changedId === scheduleIdRef.current) {
            queryClient.invalidateQueries({ queryKey: ['schedules', changedId] })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(entryChannel)
      supabase.removeChannel(scheduleChannel)
    }
  }, [queryClient])
}

/**
 * Realtime hook for notifications — shows live notification count updates.
 */
export function useRealtimeNotifications(userId?: string) {
  const queryClient = useQueryClient()
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (!userId) return

    const supabase = supabaseRef.current

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Notification',
          filter: `userId=eq.${userId}`,
        },
        () => {
          console.log('[Realtime] New notification')
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}
