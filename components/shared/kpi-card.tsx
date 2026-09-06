import * as React from 'react'
import { TrendingUp, TrendingDown, Activity, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

export type KpiCardVariant = 'default' | 'accent' | 'success' | 'error'

export interface KPICardProps {
  title: string
  value: string | number
  icon: LucideIcon
  variant?: KpiCardVariant
  change?: { value: number; label: string }
  className?: string
}

const iconBadgeVariants: Record<KpiCardVariant, string> = {
  default: 'text-primary',
  accent: 'text-accent-foreground',
  success: 'text-success',
  error: 'text-destructive',
}

export function KPICard({
  title,
  value,
  icon: Icon,
  variant = 'default',
  change,
  className,
}: KPICardProps) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="flex items-start gap-4 p-5">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            iconBadgeVariants[variant]
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <span className="text-2xl font-bold tracking-tight text-card-foreground">
            {value}
          </span>
          {change && (
            <span
              className={cn(
                'text-xs font-medium',
                change.value >= 0 ? 'text-success' : 'text-destructive'
              )}
            >
              {change.value >= 0 ? (
                <TrendingUp className="mr-1 inline size-3" />
              ) : (
                <TrendingDown className="mr-1 inline size-3" />
              )}
              {change.value >= 0 ? '+' : ''}{change.value}% {change.label}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
