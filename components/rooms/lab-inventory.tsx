'use client'

/**
 * LabInventory — displays all laboratory rooms grouped by their academic
 * specialization. Used in the Buildings / Rooms management page.
 *
 * Groupings:
 *   CISCO_NETWORKING      → Cisco / Networking Labs
 *   MULTIMEDIA_DESIGN     → Multimedia & Design Labs
 *   SOFTWARE_DEVELOPMENT  → Software Development Labs
 *   WEB_DEVELOPMENT       → Web Development Labs
 *   DATABASE_ADMINISTRATION → Database Labs
 *   NETWORK_SECURITY      → Network Security Labs
 *   GENERAL_COMPUTING     → General Computing Labs
 *   ELECTRONICS           → Electronics Labs
 *   (no specialization)   → General Laboratories
 */

import * as React from 'react'
import {
  Network,
  Monitor,
  Code2,
  Globe,
  Database,
  ShieldCheck,
  Cpu,
  Zap,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Building2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'

// ── Specialization metadata ───────────────────────────────────────────────

export const LAB_SPEC_META: Record<
  string,
  { label: string; description: string; icon: React.ElementType; color: string; bg: string }
> = {
  CISCO_NETWORKING: {
    label: 'Cisco Networking',
    description: 'Routers, switches, patch panels and network racks for CCNA/CCNP courses.',
    icon: Network,
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
  },
  MULTIMEDIA_DESIGN: {
    label: 'Multimedia & Design',
    description: 'iMac workstations, Wacom tablets, and Adobe Creative Cloud suite.',
    icon: Monitor,
    color: 'text-purple-700',
    bg: 'bg-purple-50 border-purple-200',
  },
  SOFTWARE_DEVELOPMENT: {
    label: 'Software Development',
    description: 'Developer workstations with dual monitors and Git server access.',
    icon: Code2,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  WEB_DEVELOPMENT: {
    label: 'Web Development',
    description: 'Developer machines with high-speed internet for web projects.',
    icon: Globe,
    color: 'text-cyan-700',
    bg: 'bg-cyan-50 border-cyan-200',
  },
  DATABASE_ADMINISTRATION: {
    label: 'Database Administration',
    description: 'Database workstations with Oracle, MySQL, and PostgreSQL clusters.',
    icon: Database,
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
  },
  NETWORK_SECURITY: {
    label: 'Network Security',
    description: 'Security workstations with firewalls and IDS/IPS equipment.',
    icon: ShieldCheck,
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
  },
  GENERAL_COMPUTING: {
    label: 'General Computing',
    description: 'Standard computer lab for general IT subjects and introductory courses.',
    icon: Cpu,
    color: 'text-slate-700',
    bg: 'bg-slate-50 border-slate-200',
  },
  ELECTRONICS: {
    label: 'Electronics',
    description: 'Bench setups with oscilloscopes, multimeters, and soldering equipment.',
    icon: Zap,
    color: 'text-yellow-700',
    bg: 'bg-yellow-50 border-yellow-200',
  },
}

const GENERAL_LAB_META = {
  label: 'General Laboratories',
  description: 'Science and general-purpose laboratory spaces.',
  icon: FlaskConical,
  color: 'text-teal-700',
  bg: 'bg-teal-50 border-teal-200',
}

// ── Sub-components ────────────────────────────────────────────────────────

function RoomChip({ room }: { room: any }) {
  const isActive = room.isActive !== false
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
        isActive ? 'border-border bg-background' : 'border-border/40 bg-muted/30 opacity-60'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium truncate">{room.name}</p>
          <p className="text-[11px] text-muted-foreground font-mono">{room.code}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {room.building?.name && (
          <span className="text-[10px] text-muted-foreground hidden sm:block">{room.building.name}</span>
        )}
        {isActive ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Active" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" aria-label="Inactive" />
        )}
      </div>
    </div>
  )
}

function LabGroup({
  specialization,
  rooms,
}: {
  specialization: string | null
  rooms: any[]
}) {
  const [expanded, setExpanded] = React.useState(true)
  const meta = specialization ? LAB_SPEC_META[specialization] ?? GENERAL_LAB_META : GENERAL_LAB_META
  const Icon = meta.icon
  const activeCount = rooms.filter((r) => r.isActive !== false).length

  return (
    <Card className={`border ${meta.bg}`}>
      <CardHeader
        className="cursor-pointer py-4 hover:bg-black/5 transition-colors rounded-t-lg"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-card border ${meta.bg.replace('bg-', 'border-')}`}>
              <Icon className={`h-5 w-5 ${meta.color}`} />
            </div>
            <div>
              <CardTitle className={`text-sm font-semibold ${meta.color}`}>{meta.label}</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${meta.color} border-current`}>
              {activeCount}/{rooms.length} active
            </Badge>
            <span className={`text-xs ${meta.color} transition-transform duration-200 ${expanded ? '' : 'rotate-180'}`}>
              ▲
            </span>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-4">
          {rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No rooms in this category.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room: any) => (
                <RoomChip key={room.id} room={room} />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function LabInventory({ collegeId }: { collegeId?: string | null }) {
  const { data: rooms = [], isLoading } = useQuery<any[]>({
    queryKey: ['lab-inventory', collegeId],
    queryFn: async () => {
      const params = new URLSearchParams()
      // Only fetch lab room types
      params.set('type', 'LABORATORY,COMPUTER_LAB,LECTURE_LAB')
      if (collegeId) params.set('collegeId', collegeId)
      const res = await fetch(`/api/rooms?${params}`)
      const json = await res.json()
      if (!res.ok) return []
      return json.data ?? []
    },
    staleTime: 30_000,
  })

  // Group by labSpecialization (null = General Labs)
  const grouped = React.useMemo(() => {
    const map = new Map<string | null, any[]>()

    // Pre-seed with known specializations so they appear in a fixed order
    const ORDER = [
      'CISCO_NETWORKING',
      'MULTIMEDIA_DESIGN',
      'SOFTWARE_DEVELOPMENT',
      'WEB_DEVELOPMENT',
      'DATABASE_ADMINISTRATION',
      'NETWORK_SECURITY',
      'GENERAL_COMPUTING',
      'ELECTRONICS',
      null, // General (no specialization)
    ]
    ORDER.forEach((key) => map.set(key, []))

    for (const room of rooms) {
      const key: string | null = room.labSpecialization ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(room)
    }

    // Remove empty groups except when total is zero (show empty state)
    return ORDER.map((key) => ({ specialization: key, rooms: map.get(key) ?? [] })).filter(
      (g) => g.rooms.length > 0
    )
  }, [rooms])

  const totalLabs = rooms.length
  const activeLabs = rooms.filter((r: any) => r.isActive !== false).length

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground text-sm gap-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading lab inventory...
      </div>
    )
  }

  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
        <FlaskConical className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No laboratories found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add laboratory rooms from the Buildings tab and assign a lab specialization.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 rounded-lg bg-muted/40 border px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <FlaskConical className="h-4 w-4 text-[#1B4332]" />
          <span className="font-medium">{totalLabs} laboratory rooms</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          {activeLabs} active
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
          {totalLabs - activeLabs} inactive
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="text-xs text-muted-foreground">
          {grouped.length} specialization{grouped.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Grouped lab cards */}
      <div className="space-y-3">
        {grouped.map((g) => (
          <LabGroup
            key={g.specialization ?? '__general__'}
            specialization={g.specialization}
            rooms={g.rooms}
          />
        ))}
      </div>
    </div>
  )
}
