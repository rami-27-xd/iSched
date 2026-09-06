'use client'

/**
 * CollegeFilter — top-level college switcher displayed in the topbar.
 *
 * SUPER_ADMIN sees a dropdown listing all colleges + "All Colleges" option.
 * ADMIN / FACULTY see a read-only badge showing their college.
 */

import * as React from 'react'
import { Building2, ChevronDown, Check } from 'lucide-react'
import { useCollege } from '@/lib/college-context'

export function CollegeFilter({ userRole }: { userRole: string }) {
  const { colleges, loadingColleges, selectedCollegeId, setSelectedCollegeId, selectedCollege } =
    useCollege()
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const isSuperAdmin = userRole === 'SUPER_ADMIN'

  // Close on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [open])

  const displayLabel = selectedCollege
    ? selectedCollege.abbreviation
    : 'All Colleges'

  // Non-SUPER_ADMIN: read-only badge
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground select-none">
        <Building2 className="h-3.5 w-3.5 text-[#1B4332]" />
        <span className="text-[#1B4332] font-semibold">{displayLabel}</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        aria-label="Switch college"
        aria-expanded={open}
      >
        <Building2 className="h-3.5 w-3.5 text-[#1B4332]" />
        <span className="text-[#1B4332] font-semibold max-w-[140px] truncate">{displayLabel}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-lg border bg-popover p-1 shadow-lg z-50 animate-in fade-in-0 zoom-in-95">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Filter by College
          </p>

          {/* "All Colleges" option */}
          <button
            type="button"
            onClick={() => { setSelectedCollegeId(null); setOpen(false) }}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
              !selectedCollegeId ? 'text-[#1B4332] font-semibold bg-[#1B4332]/5' : ''
            }`}
          >
            <span>All Colleges</span>
            {!selectedCollegeId && <Check className="h-4 w-4" />}
          </button>

          <div className="my-1 h-px bg-border" />

          {loadingColleges ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading...</p>
          ) : (
            colleges.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setSelectedCollegeId(c.id); setOpen(false) }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
                  selectedCollegeId === c.id ? 'text-[#1B4332] font-semibold bg-[#1B4332]/5' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 rounded bg-[#1B4332]/10 text-[#1B4332] px-1.5 py-0.5 text-[10px] font-bold">
                    {c.abbreviation}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{c.name}</span>
                </div>
                {selectedCollegeId === c.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
