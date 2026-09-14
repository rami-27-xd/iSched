import { StatTilesSkeleton, LinesSkeleton } from "@/components/shared/loading-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy aria-label="Loading analytics">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-64" />
      </div>
      <StatTilesSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <LinesSkeleton lines={8} className="rounded-xl border border-border p-4" label="Loading chart" />
        <LinesSkeleton lines={8} className="rounded-xl border border-border p-4" label="Loading chart" />
      </div>
    </div>
  )
}
