"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** Every list in the app shows at most this many rows per page. */
export const PAGE_SIZE = 10

/**
 * Client-side pagination over an already-loaded array.
 *
 * The page resets to 1 whenever the item set changes size (a filter, search
 * or delete shrank/grew the list), so a stale page number can never leave the
 * user staring at an empty page.
 */
export function usePagination<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const [page, setPage] = React.useState(1)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  React.useEffect(() => {
    setPage(1)
  }, [total])

  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  const pageItems = React.useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize])

  return {
    page: safePage,
    setPage,
    pageCount,
    pageItems,
    total,
    pageSize,
    /** 1-based index of the first/last row on this page, for "1–10 of 42". */
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  }
}

interface PaginationControlsProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  total?: number
  from?: number
  to?: number
  /** Noun for the summary, e.g. "faculty" → "1–10 out of 42 faculty". */
  label?: string
  className?: string
  /** Compact variant for narrow columns (schedule list, nested tables). */
  size?: "sm" | "md"
}

/** Builds the page-number strip: 1 … 4 5 6 … 20 (never more than 7 slots). */
function pageWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1])
  if (page <= 3) { pages.add(2); pages.add(3); pages.add(4) }
  if (page >= pageCount - 2) { pages.add(pageCount - 1); pages.add(pageCount - 2); pages.add(pageCount - 3) }
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const out: (number | "…")[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…")
    out.push(sorted[i])
  }
  return out
}

/**
 * Prev / page numbers / Next, plus a "1–10 of 42" summary. Renders nothing
 * when everything fits on one page, so it can be dropped under any list
 * unconditionally.
 */
export function PaginationControls({
  page,
  pageCount,
  onPageChange,
  total,
  from,
  to,
  label,
  className,
  size = "md",
}: PaginationControlsProps) {
  if (pageCount <= 1) return null
  const btn = size === "sm" ? "h-7 min-w-7 px-1.5 text-[11px]" : "h-8 min-w-8 px-2 text-xs"
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-between gap-2", className)}
    >
      {total !== undefined && from !== undefined && to !== undefined ? (
        <p className={cn("text-muted-foreground", size === "sm" ? "text-[11px]" : "text-xs")}>
          {from}–{to} out of {total}{label ? ` ${label}` : ""}
        </p>
      ) : <span />}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={cn("inline-flex items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40", btn)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pageWindow(page, pageCount).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center rounded-md border transition-colors",
                btn,
                p === page
                  ? "border-[#1B4332] bg-[#1B4332] font-semibold text-white"
                  : "border-input bg-background text-foreground hover:bg-muted"
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={cn("inline-flex items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40", btn)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  )
}
