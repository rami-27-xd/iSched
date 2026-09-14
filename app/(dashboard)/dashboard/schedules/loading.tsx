import { ScheduleListSkeleton, ScheduleDetailSkeleton } from "@/components/shared/loading-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Route-level loading UI for Manage Schedules. Next.js shows this the instant a
 * navigation to /dashboard/schedules starts — before the (large) page chunk and
 * its data arrive — so clicking "Manage Schedules" always gives immediate
 * feedback. Mirrors the page's layout: header + action bar, then the
 * schedule-list column beside the schedule-detail panel.
 */
export default function SchedulesLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy aria-label="Loading schedules">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <ScheduleListSkeleton />
        </div>
        <div className="min-w-0">
          <ScheduleDetailSkeleton />
        </div>
      </div>
    </div>
  )
}
