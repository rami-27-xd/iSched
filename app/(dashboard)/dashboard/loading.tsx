import { StatTilesSkeleton, CardListSkeleton, LinesSkeleton } from "@/components/shared/loading-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy aria-label="Loading dashboard">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <StatTilesSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <Skeleton className="mb-4 h-5 w-40" />
          <CardListSkeleton count={3} compact label="Loading schedules" />
        </div>
        <div className="rounded-xl border border-border p-4">
          <Skeleton className="mb-4 h-5 w-40" />
          <LinesSkeleton lines={6} label="Loading" />
        </div>
      </div>
    </div>
  )
}
