'use client'

/**
 * ClusterManager — SUPER_ADMIN UI for creating and managing Faculty Clusters.
 *
 * A Faculty Cluster is an academic division (e.g. "Social Sciences Faculty")
 * that groups departments together. Each SUPER_ADMIN can be scoped to one
 * cluster so they only see and approve data from their assigned departments.
 *
 * Accessible at: /dashboard/settings (Settings page, Admin tab)
 */

import * as React from 'react'
import {
  Users, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Building2, ShieldCheck, Loader2, Check, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchClusters(collegeId?: string | null) {
  const params = new URLSearchParams()
  if (collegeId) params.set('collegeId', collegeId)
  const res = await fetch(`/api/clusters?${params}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed to fetch clusters')
  return json.data ?? []
}

async function fetchDepartments() {
  const res = await fetch('/api/departments')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed to fetch departments')
  return json.data ?? []
}

async function fetchSuperAdmins() {
  const res = await fetch('/api/users?role=SUPER_ADMIN')
  const json = await res.json()
  if (!res.ok) return []
  return json.data ?? []
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MultiSelect({
  label,
  all,
  selected,
  onChange,
  getId,
  getLabel,
}: {
  label: string
  all: any[]
  selected: string[]
  onChange: (ids: string[]) => void
  getId: (item: any) => string
  getLabel: (item: any) => string
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label} <span className="text-[10px] normal-case">({selected.length} selected)</span>
      </Label>
      <div className="max-h-36 overflow-y-auto rounded-lg border bg-background divide-y">
        {all.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">None available</p>
        ) : (
          all.map((item) => {
            const id = getId(item)
            const isSelected = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${
                  isSelected ? 'bg-[#1B4332]/5 font-medium text-[#1B4332]' : ''
                }`}
              >
                <span className="truncate">{getLabel(item)}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#1B4332]" />}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ClusterManager({ collegeId }: { collegeId?: string | null }) {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<any | null>(null)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  // Pending deletion — drives an in-app confirmation dialog rather than the
  // browser's native confirm(), which renders as a raw "localhost:3000 says" popup.
  const [deleteTarget, setDeleteTarget] = React.useState<any | null>(null)
  const [form, setForm] = React.useState({ name: '', description: '', departmentIds: [] as string[], supervisorIds: [] as string[] })

  const { data: clusters = [], isLoading } = useQuery({
    queryKey: ['clusters', collegeId],
    queryFn: () => fetchClusters(collegeId),
    staleTime: 30_000,
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-all'],
    queryFn: fetchDepartments,
    staleTime: 60_000,
  })

  const { data: superAdmins = [] } = useQuery({
    queryKey: ['super-admins'],
    queryFn: fetchSuperAdmins,
    staleTime: 60_000,
  })

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', departmentIds: [], supervisorIds: [] })
    setModalOpen(true)
  }

  function openEdit(cluster: any) {
    setEditing(cluster)
    setForm({
      name: cluster.name,
      description: cluster.description ?? '',
      departmentIds: cluster.departments.map((d: any) => d.id),
      supervisorIds: cluster.supervisors.map((u: any) => u.id),
    })
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const res = await fetch(`/api/clusters/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Update failed')
        return json.data
      } else {
        const res = await fetch('/api/clusters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, collegeId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Create failed')
        return json.data
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Cluster updated' : 'Cluster created')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['clusters'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/clusters/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Delete failed')
    },
    onSuccess: () => {
      toast.success('Cluster deleted')
      queryClient.invalidateQueries({ queryKey: ['clusters'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />Loading clusters…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Faculty Clusters</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Group departments into academic divisions. Each Department Chair can be scoped to one cluster.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />New Cluster
        </Button>
      </div>

      {clusters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No clusters yet. Create one to start scoping access.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clusters.map((cluster: any) => {
            const isOpen = expanded.has(cluster.id)
            return (
              <Card key={cluster.id}>
                <CardHeader
                  className="cursor-pointer py-3 hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(cluster.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <Users className="h-4 w-4 text-[#1B4332]" />
                      <CardTitle className="text-sm font-semibold">{cluster.name}</CardTitle>
                      {cluster.description && (
                        <span className="text-xs text-muted-foreground hidden sm:block">— {cluster.description}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {cluster.departments.length} dept{cluster.departments.length !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {cluster.supervisors.length} supervisor{cluster.supervisors.length !== 1 ? 's' : ''}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); openEdit(cluster) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(cluster) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="pt-0 pb-4 grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        <Building2 className="inline h-3 w-3 mr-1" />Departments
                      </p>
                      {cluster.departments.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">None assigned</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {cluster.departments.map((d: any) => (
                            <span key={d.id} className="rounded-full bg-[#1B4332]/10 text-[#1B4332] px-2 py-0.5 text-[11px] font-medium">
                              {d.abbreviation}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        <ShieldCheck className="inline h-3 w-3 mr-1" />Supervisors (Dept. Chairs)
                      </p>
                      {cluster.supervisors.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">None assigned</p>
                      ) : (
                        <div className="space-y-1">
                          {cluster.supervisors.map((u: any) => (
                            <p key={u.id} className="text-xs">{u.firstName} {u.lastName} <span className="text-muted-foreground">({u.email})</span></p>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Cluster' : 'Create Faculty Cluster'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cname">Cluster Name <span className="text-red-500">*</span></Label>
              <Input
                id="cname"
                placeholder="e.g. Social Sciences Faculty"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cdesc">Description</Label>
              <Input
                id="cdesc"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <MultiSelect
              label="Assign Departments"
              all={departments}
              selected={form.departmentIds}
              onChange={(ids) => setForm((f) => ({ ...f, departmentIds: ids }))}
              getId={(d) => d.id}
              getLabel={(d) => `${d.name} (${d.abbreviation})`}
            />
            <MultiSelect
              label="Assign Supervisors (Department Chairs)"
              all={superAdmins}
              selected={form.supervisorIds}
              onChange={(ids) => setForm((f) => ({ ...f, supervisorIds: ids }))}
              getId={(u) => u.id}
              getLabel={(u) => `${u.firstName} ${u.lastName} — ${u.email}`}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saveMutation.isPending}>
              <X className="h-4 w-4 mr-1" />Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim()}
              className="bg-[#1B4332] hover:bg-[#2D6A4F] text-white gap-2"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Cluster'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete cluster confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete cluster?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes{' '}
            <strong className="text-foreground">{deleteTarget?.name ?? 'this cluster'}</strong>
            . Faculty and Department Chairs assigned to it will lose that assignment. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null) }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
