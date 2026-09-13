"use client"

import { useLinkStatus } from "next/link"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Immediate feedback for a navigation that is still loading. Rendered INSIDE a
 * next/link <Link>: useLinkStatus() reports `pending` from the moment the link
 * is clicked until the destination route (its JS chunk + data) has rendered,
 * which for the schedules page is long enough that a click with no feedback
 * feels like nothing happened.
 */
export function LinkPendingSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <Loader2
      aria-label="Loading"
      className={cn("size-3.5 shrink-0 animate-spin", className)}
    />
  )
}
