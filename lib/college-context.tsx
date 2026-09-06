'use client'

/**
 * CollegeContext — per-college multi-tenancy filter.
 *
 * Provides the selected college to every dashboard page so each page can
 * scope its API calls accordingly. Selection is persisted to localStorage so
 * it survives page refreshes.
 *
 * Usage:
 *   const { selectedCollegeId, setSelectedCollegeId, colleges } = useCollege()
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'

export interface CollegeOption {
  id: string
  name: string
  abbreviation: string
}

interface CollegeContextValue {
  colleges: CollegeOption[]
  loadingColleges: boolean
  selectedCollegeId: string | null   // null = "All Colleges" (SUPER_ADMIN only)
  setSelectedCollegeId: (id: string | null) => void
  selectedCollege: CollegeOption | null
}

const CollegeContext = React.createContext<CollegeContextValue>({
  colleges: [],
  loadingColleges: false,
  selectedCollegeId: null,
  setSelectedCollegeId: () => {},
  selectedCollege: null,
})

export function useCollege() {
  return React.useContext(CollegeContext)
}

const STORAGE_KEY = 'isched-selected-college'

export function CollegeProvider({
  children,
  userRole,
  // The college ID tied to the logged-in user — used to lock ADMIN/FACULTY to
  // their own college automatically.
  defaultCollegeId,
}: {
  children: React.ReactNode
  userRole: string
  defaultCollegeId?: string | null
}) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN'

  // Read persisted value on mount (SUPER_ADMIN only — others are locked)
  const [selectedCollegeId, setSelectedCollegeIdRaw] = React.useState<string | null>(() => {
    if (!isSuperAdmin) return defaultCollegeId ?? null
    if (typeof window === 'undefined') return null
    return localStorage.getItem(STORAGE_KEY) ?? null
  })

  // Non-super-admin users are always locked to their own college
  React.useEffect(() => {
    if (!isSuperAdmin && defaultCollegeId) {
      setSelectedCollegeIdRaw(defaultCollegeId)
    }
  }, [isSuperAdmin, defaultCollegeId])

  function setSelectedCollegeId(id: string | null) {
    if (!isSuperAdmin) return // only SUPER_ADMIN can switch colleges
    setSelectedCollegeIdRaw(id)
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const { data: colleges = [], isLoading: loadingColleges } = useQuery<CollegeOption[]>({
    queryKey: ['colleges-list'],
    queryFn: async () => {
      const res = await fetch('/api/colleges')
      const json = await res.json()
      if (!res.ok) return []
      return json.data ?? []
    },
    staleTime: 300_000, // 5 min
  })

  const selectedCollege = React.useMemo(
    () => colleges.find((c) => c.id === selectedCollegeId) ?? null,
    [colleges, selectedCollegeId]
  )

  return (
    <CollegeContext.Provider
      value={{ colleges, loadingColleges, selectedCollegeId, setSelectedCollegeId, selectedCollege }}
    >
      {children}
    </CollegeContext.Provider>
  )
}
