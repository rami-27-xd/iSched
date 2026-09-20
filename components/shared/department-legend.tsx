"use client"

import { Info } from "lucide-react"
import { departmentColor } from "@/lib/department-colors"

/** A department (college) chip in its colour — the same everywhere in System Logs. */
export function DepartmentChip({
  abbreviation,
  title,
  className = "",
}: {
  abbreviation: string | null | undefined
  title?: string
  className?: string
}) {
  const c = departmentColor(abbreviation)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight ${className}`}
      style={{ background: c.bg, color: c.fg, borderColor: c.border }}
      title={title}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.border }} aria-hidden="true" />
      {abbreviation || "—"}
    </span>
  )
}

/**
 * Colour key: one chip per department/college present in the data, plus any
 * extra items the tab wants to explain (e.g. "Free", "Not yet published").
 */
export function DepartmentLegend({
  departments,
  extra,
  label = "Colour key — department / college:",
}: {
  departments: { abbreviation: string; name?: string; college?: string }[]
  extra?: React.ReactNode
  label?: string
}) {
  if (departments.length === 0 && !extra) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        {label}
      </span>
      {departments.map((d) => (
        <DepartmentChip
          key={d.abbreviation}
          abbreviation={d.abbreviation}
          title={[d.name, d.college && d.college !== d.abbreviation ? `College: ${d.college}` : null].filter(Boolean).join(" · ") || undefined}
        />
      ))}
      {extra}
    </div>
  )
}
