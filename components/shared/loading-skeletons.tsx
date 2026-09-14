import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Skeleton placeholders that mirror the shape of what is loading, used instead
 * of a "Loading…" line. Every page/list has one that matches its layout; the
 * route-level loading.tsx files reuse the same pieces so the in-page and
 * navigation loading states look identical.
 */

const srOnly = { role: "status" as const, "aria-live": "polite" as const, "aria-busy": true as const }

/** Table-shaped rows (Users, Faculty, subject tables). */
export function TableSkeleton({
  rows = 8,
  cols = 5,
  className,
  label = "Loading",
}: {
  rows?: number
  cols?: number
  className?: string
  label?: string
}) {
  return (
    <div {...srOnly} aria-label={label} className={cn("overflow-hidden rounded-lg border border-border", className)}>
      <div className="flex gap-4 border-b border-border bg-muted/50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-40" : "w-24")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-4", c === 0 ? "w-44" : c === cols - 1 ? "ml-auto w-8" : "w-24")}
              style={{ opacity: 1 - r * 0.06 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Stacked cards (Buildings, Departments, schedule cards, request panels). */
export function CardListSkeleton({
  count = 4,
  className,
  compact = false,
  label = "Loading",
}: {
  count?: number
  className?: string
  compact?: boolean
  label?: string
}) {
  return (
    <div {...srOnly} aria-label={label} className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("rounded-lg border border-border bg-card", compact ? "p-3" : "p-4")} style={{ opacity: 1 - i * 0.12 }}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/5" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
          {!compact && (
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Grid of cards (Faculty Availability, lab inventory). */
export function CardGridSkeleton({
  count = 4,
  className,
  label = "Loading",
}: {
  count?: number
  className?: string
  label?: string
}) {
  return (
    <div {...srOnly} aria-label={label} className={cn("grid gap-4 md:grid-cols-1 lg:grid-cols-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <FacultyAvailabilityCardSkeleton key={i} style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  )
}

/** One Faculty Availability card: green header, day tabs, presets, timeline. */
export function FacultyAvailabilityCardSkeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" style={style}>
      <div className="flex items-center justify-between bg-[#1B4332] px-4 py-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-40 bg-white/20" />
          <Skeleton className="h-3 w-28 bg-white/10" />
        </div>
        <Skeleton className="h-8 w-[4.5rem] rounded-md bg-white/20" />
      </div>
      <div className="space-y-3 p-4">
        <div className="flex gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-14 rounded-md" />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-7 w-36 rounded-md" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  )
}

/** The Manage Schedules left column (schedule cards). */
export function ScheduleListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div {...srOnly} aria-label="Loading schedules" className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-3" style={{ opacity: 1 - i * 0.15 }}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-48" />
        </div>
      ))}
    </div>
  )
}

/** The Manage Schedules detail panel: toolbar, view tabs, day tabs, entry rows. */
export function ScheduleDetailSkeleton() {
  return (
    <div {...srOnly} aria-label="Loading schedule" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="ml-auto h-6 w-20 rounded-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <Skeleton className="h-9 w-full rounded-none" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-border px-3 py-2.5" style={{ opacity: 1 - i * 0.12 }}>
            <Skeleton className="h-8 w-1 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Weekly calendar grid placeholder (while the FullCalendar chunk loads). */
export function CalendarSkeleton() {
  return (
    <div {...srOnly} aria-label="Loading calendar" className="overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="h-12 w-full rounded-none bg-[#1B4332]/80" />
      <div className="grid grid-cols-[56px_1fr] gap-0 p-3">
        <div className="space-y-6 pt-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-10" />
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-8 flex-1" style={{ opacity: i % 2 ? 0.5 : 0.9 }} />
              <Skeleton className="h-8 w-1/4" style={{ opacity: 0.6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A block of text lines (dropdown contents, small panels). */
export function LinesSkeleton({
  lines = 3,
  className,
  label = "Loading",
}: {
  lines?: number
  className?: string
  label?: string
}) {
  return (
    <div {...srOnly} aria-label={label} className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  )
}

/** KPI tiles row (dashboard / analytics). */
export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div {...srOnly} aria-label="Loading statistics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Generic page: title row + toolbar + a table. Used by most route loading.tsx files. */
export function PageSkeleton({
  variant = "table",
  label = "Loading page",
}: {
  variant?: "table" | "cards" | "grid"
  label?: string
}) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy aria-label={label}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-56" />
        </div>
      </div>
      {variant === "table" && <TableSkeleton />}
      {variant === "cards" && <CardListSkeleton />}
      {variant === "grid" && <CardGridSkeleton />}
    </div>
  )
}
