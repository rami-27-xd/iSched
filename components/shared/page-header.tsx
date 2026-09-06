import * as React from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageHeaderProps {
  /** Page title — omit to suppress the title block entirely */
  title?: string
  /** Optional description shown below the title */
  description?: string
  /** Optional right-side action area (buttons, filters, etc.) */
  action?: React.ReactNode
  children?: React.ReactNode
}

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------

export function PageHeader({ title, description, action, children }: PageHeaderProps) {
  const actionContent = action ?? children
  const hasText = !!title || !!description
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {hasText && (
        <div className="flex flex-col gap-1">
          {title && (
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      {actionContent && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actionContent}</div>
      )}
    </div>
  )
}
