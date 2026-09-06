import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Variant definitions
// ---------------------------------------------------------------------------

/**
 * Status badge variant mapping. Each variant maps to Tailwind classes using
 * the project's CSS-variable-based design tokens.
 */
const statusBadgeVariants = cva('', {
  variants: {
    status: {
      // Schedule statuses
      draft: 'bg-muted text-muted-foreground',
      published: 'bg-success/10 text-success',
      active: 'bg-primary/10 text-primary',
      archived: 'bg-muted text-muted-foreground',

      // Conflict types
      conflict: 'bg-destructive/10 text-destructive',
      warning: 'bg-warning/15 text-warning-foreground',
      resolved: 'bg-success/10 text-success',

      // Approval / general
      pending: 'bg-accent/15 text-accent-foreground',
      approved: 'bg-success/10 text-success',
      rejected: 'bg-destructive/10 text-destructive',

      // Room / resource availability
      available: 'bg-success/10 text-success',
      occupied: 'bg-destructive/10 text-destructive',
      maintenance: 'bg-warning/15 text-warning-foreground',

      // Generic
      info: 'bg-info/10 text-info',
      success: 'bg-success/10 text-success',
      error: 'bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: {
    status: 'draft',
  },
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusBadgeStatus = NonNullable<
  VariantProps<typeof statusBadgeVariants>['status']
>

export interface StatusBadgeProps {
  /** The status to render */
  status: StatusBadgeStatus
  /** Override the displayed label (defaults to the status value, title-cased) */
  label?: string
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'pointer-events-none border-transparent font-medium',
        statusBadgeVariants({ status }),
        className
      )}
    >
      {label ?? formatLabel(status)}
    </Badge>
  )
}
