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
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading schedules">
      {/* Header + toolbar */}
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
        {/* Schedule list column */}
        <div className="space-y-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Loading schedules…
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
