import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useScheduleStore } from '@/stores/schedule-store'
import { useUpdateEntry } from '@/hooks/use-schedules'

const DEBOUNCE_MS = 1000

export function useAutoSave() {
  const { pendingChanges, isDirty, currentScheduleId, setSaveStatus, markSaved } =
    useScheduleStore()
  const updateEntry = useUpdateEntry()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isDirty || !currentScheduleId || pendingChanges.size === 0) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      setSaveStatus('saving')

      try {
        const promises = Array.from(pendingChanges.entries()).map(
          ([entryId, changes]) =>
            updateEntry.mutateAsync({
              scheduleId: currentScheduleId,
              entryId,
              changes,
            })
        )
        await Promise.all(promises)
        markSaved()
      } catch (error) {
        setSaveStatus('error')
        toast.error('Failed to save changes')
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isDirty, pendingChanges, currentScheduleId, setSaveStatus, markSaved, updateEntry])
}
