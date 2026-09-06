"use client"

import { useState, useMemo } from "react"
import { RoleGuard } from "@/components/shared/role-guard"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Users, Search, Briefcase, Plus, MoreHorizontal, Loader2, Minus, Trash2 } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { useQuery } from "@tanstack/react-query"
import { useFacultyList, useUpdateFaculty, useCreateFaculty, useDeleteFaculty, useUsers, useSubjects, useSections } from "@/hooks/use-data"
import { useIsMobile } from "@/hooks/use-mobile"

// Type for section counts per subject: { "Subject Title": numberOfSections }
type SectionCountMap = Record<string, number>

// ── SpecializationPicker — defined OUTSIDE FacultyPage to prevent remount on render ──
function SpecializationPicker({
  sectionCounts,
  maxUnits,
  subjectTitles,
  subjectInfoMap,
  sectionCountByYear,
  onToggle,
  onSetCount,
}: {
  sectionCounts: SectionCountMap
  maxUnits: number
  subjectTitles: string[]
  subjectInfoMap: Record<string, { units: number; year: number; type: string; semester?: string }>
  sectionCountByYear: Record<number, number>
  onToggle: (title: string) => void
  onSetCount: (title: string, count: number) => void
}) {
  const [specSearch, setSpecSearch] = useState("")
  const [semFilter, setSemFilter] = useState<"ALL" | "FIRST" | "SECOND">("ALL")

  const totalLoad = Object.entries(sectionCounts).reduce((sum, [title, secCount]) => {
    const info = subjectInfoMap[title]
    if (!info || secCount <= 0) return sum
    return sum + info.units * secCount
  }, 0)

  const selectedCount = Object.keys(sectionCounts).filter(k => sectionCounts[k] > 0).length

  const visibleSubjects = useMemo(() => {
    let pool = subjectTitles
    if (semFilter !== "ALL") {
      pool = pool.filter(t => (subjectInfoMap[t]?.semester ?? "FIRST") === semFilter)
    }
    if (!specSearch.trim()) return pool
    const q = specSearch.toLowerCase()
    return pool.filter(t => t.toLowerCase().includes(q))
  }, [specSearch, semFilter, subjectTitles, subjectInfoMap])

  function getMaxSections(title: string): number {
    const info = subjectInfoMap[title]
    if (!info) return 1
    return sectionCountByYear[info.year] ?? 1
  }

  return (
    <div className="grid gap-2">
      <Label>
        Teaching Load
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {totalLoad} / {maxUnits}u
        </span>
      </Label>
      {/* Progress bar */}
      <div className="w-full bg-muted/30 rounded-full h-1.5 mb-1">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{
            width: `${Math.min(100, (totalLoad / (maxUnits || 1)) * 100)}%`,
            backgroundColor: totalLoad > maxUnits ? '#ef4444' : '#1B4332',
          }}
        />
      </div>
      {totalLoad > maxUnits && (
        <p className="text-xs text-amber-600">
          Teaching load ({totalLoad}u) exceeds max units ({maxUnits}u) — the scheduler will cap actual assignments
        </p>
      )}

      {/* Search + semester filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search subjects..."
            value={specSearch}
            onChange={(e) => setSpecSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <select
          value={semFilter}
          onChange={(e) => setSemFilter(e.target.value as "ALL" | "FIRST" | "SECOND")}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
        >
          <option value="ALL">All Semesters</option>
          <option value="FIRST">1st Semester</option>
          <option value="SECOND">2nd Semester</option>
        </select>
      </div>

      {/* Subject list */}
      <div className="max-h-52 overflow-y-auto rounded-lg border border-input divide-y divide-border">
        {subjectTitles.length === 0 ? (
          <p className="text-xs text-muted-foreground italic p-3">No subjects available</p>
        ) : visibleSubjects.length === 0 ? (
          <p className="text-xs text-muted-foreground italic p-3">No subjects match &quot;{specSearch}&quot;</p>
        ) : (
          visibleSubjects.map((title) => {
            const info = subjectInfoMap[title]
            const maxSec = getMaxSections(title)
            const currentCount = sectionCounts[title] ?? 0
            const isSelected = currentCount > 0
            const subjectLoad = (info?.units ?? 0) * currentCount

            return (
              <div
                key={title}
                className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(title)}
                  className="rounded border-input shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate ${isSelected ? 'font-medium' : ''}`}>{title}</span>
                    {info?.type === "LABORATORY" && (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-[#2D6A4F]/10 text-[#2D6A4F]">Lab</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {info?.units ?? 0}u per section · Year {info?.year ?? '?'} · {maxSec} section{maxSec !== 1 ? 's' : ''} available
                  </span>
                </div>
                {isSelected && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSetCount(title, currentCount - 1)}
                      className="h-6 w-6 rounded border border-input flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{currentCount}</span>
                    <button
                      type="button"
                      onClick={() => onSetCount(title, currentCount + 1)}
                      disabled={currentCount >= maxSec}
                      className="h-6 w-6 rounded border border-input flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <span className="text-[10px] text-muted-foreground ml-1 w-8">= {subjectLoad}u</span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Summary */}
      {selectedCount > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex flex-wrap gap-1">
            {Object.entries(sectionCounts)
              .filter(([, c]) => c > 0)
              .map(([title, count]) => {
                const info = subjectInfoMap[title]
                return (
                  <Badge key={title} variant="secondary" className="text-xs">
                    {title}: {count} {count === 1 ? 'class' : 'classes'} ({(info?.units ?? 0) * count}u)
                  </Badge>
                )
              })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {selectedCount} {selectedCount === 1 ? 'subject' : 'subjects'} · {Object.values(sectionCounts).reduce((a, b) => a + b, 0)} total classes · {totalLoad}u teaching load
          </p>
        </div>
      )}
    </div>
  )
}

// ── MobileFacultyList — extracted to avoid JSX nesting issues ──────────────────
function MobileFacultyList({
  grouped,
  expandedRows,
  subjectInfoMap,
  onToggleRow,
  onEdit,
  onDelete,
}: {
  grouped: { label: string; abbr: string; members: any[] }[]
  expandedRows: Set<string>
  subjectInfoMap: Record<string, { units: number; year: number; type: string }>
  onToggleRow: (id: string) => void
  onEdit: (f: any) => void
  onDelete: (f: any) => void
}) {
  return (
    <div className="space-y-5">
      {grouped.map(({ label, abbr, members: deptMembers }) => (
        <div key={label} className="space-y-2">
          {/* Dept header */}
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1B4332] text-white text-[10px] font-bold shrink-0">
              {abbr.slice(0, 2)}
            </div>
            <span className="text-sm font-semibold text-[#1B4332]">{label}</span>
            <span className="text-xs text-muted-foreground">({deptMembers.length})</span>
          </div>
          {/* Members */}
          {deptMembers.map((f: any) => {
            const saved = f.sectionCounts as Record<string, number> | null
            const counts: Record<string, number> = saved && typeof saved === "object" && Object.keys(saved).length > 0 ? saved : {}
            const specEntries = Object.entries(counts).filter(([, c]) => c > 0)
            const totalLoad = specEntries.reduce((sum, [title, count]) => {
              const info = subjectInfoMap[title]
              return sum + (info?.units ?? 0) * count
            }, 0)
            return (
              <Card key={f.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{f.user?.firstName} {f.user?.lastName}</p>
                      {f.user?.email && !f.user.email.endsWith('@faculty.slsu.edu.ph') && !f.user.email.endsWith('@stub.local') && (
                        <p className="text-xs text-muted-foreground truncate">{f.user.email}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs">{f.department?.abbreviation}</Badge>
                        <Badge variant={f.isActive ? "default" : "secondary"} className="text-xs">
                          {f.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{f.maxUnitsPerWeek}u/wk · {f.hoursPerWeek ?? 0}h/wk</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(f)}>
                          <Briefcase className="mr-2 h-4 w-4" />Edit Faculty
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(f)}>
                          <Trash2 className="mr-2 h-4 w-4 text-red-600" />Delete Faculty
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {specEntries.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex flex-wrap gap-1">
                        {(expandedRows.has(f.id) ? specEntries : specEntries.slice(0, 2)).map(([title, count]) => {
                          const info = subjectInfoMap[title]
                          return (
                            <Badge key={title} variant="secondary" className="text-xs">
                              {title}: {count} cls
                              <span className="ml-1 text-muted-foreground">({(info?.units ?? 0) * count}u)</span>
                            </Badge>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-muted-foreground">
                          {specEntries.length} subjects · {totalLoad}u / {f.maxUnitsPerWeek}u
                        </p>
                        {specEntries.length > 2 && (
                          <button
                            type="button"
                            onClick={() => onToggleRow(f.id)}
                            className="text-[10px] text-[#1B4332] font-medium hover:underline"
                          >
                            {expandedRows.has(f.id) ? 'Show less' : `+${specEntries.length - 2} more`}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function FacultyPage() {
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  // mode "existing" links an approved user; "new" creates a person from scratch
  const [addMode, setAddMode] = useState<"existing" | "new">("existing")
  const [addForm, setAddForm] = useState({
    userId: "",
    firstName: "",
    lastName: "",
    sectionCounts: {} as SectionCountMap,
    maxUnitsPerWeek: 21,
    hoursPerWeek: 0,
  })
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)
  const [editForm, setEditForm] = useState({
    firstName: "", lastName: "",
    sectionCounts: {} as SectionCountMap,
    maxUnitsPerWeek: 21, hoursPerWeek: 0, isActive: true,
    clusterId: "",
  })

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  function toggleRow(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }


  // Fetch the current user first so we can scope the faculty query correctly
  const { data: currentUser } = useQuery({
    queryKey: ["current-user-me"],
    queryFn: async () => {
      const res = await fetch("/api/users/me")
      const json = await res.json()
      return json.data ?? null
    },
  })
  const isAdmin = currentUser?.role === "ADMIN"
  const isSuperAdminEditor = currentUser?.role === "SUPER_ADMIN"
  const userDeptId: string | undefined = currentUser?.departmentId ?? undefined
  // Both chair roles are locked server-side to their own department's faculty
  // (GET /api/faculty ignores any dept/college param), so no filter is passed.
  const { data: faculty = [], isLoading } = useFacultyList()
  const isMobile = useIsMobile()
  const { data: approvedUsers = [] } = useUsers({ approved: true })
  const { data: subjects = [] } = useSubjects()
  const { data: sections = [] } = useSections()
  const createFaculty = useCreateFaculty()
  const updateFaculty = useUpdateFaculty()
  const deleteFaculty = useDeleteFaculty()
  // Faculty pending permanent removal — drives the confirm dialog.
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  async function handleDeleteFaculty() {
    if (!deleteTarget) return
    try {
      await deleteFaculty.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
      setEditOpen(false)
    } catch {
      // error toast is surfaced by the mutation's onError
    }
  }

  // Subject titles for listing
  const subjectTitles = useMemo(() => {
    const titles = subjects.map((s: any) => s.title).filter(Boolean)
    return [...new Set(titles)] as string[]
  }, [subjects])

  // Map subject title → { units, year, type, semester }
  const subjectInfoMap = useMemo(() => {
    const map: Record<string, { units: number; year: number; type: string; semester: string }> = {}
    for (const s of subjects) {
      if (s.title && !map[s.title]) {
        map[s.title] = { units: s.units ?? 0, year: s.year ?? 1, type: s.type ?? "LECTURE", semester: s.semester ?? "FIRST" }
      }
    }
    return map
  }, [subjects])

  // Count sections per year level
  const sectionCountByYear = useMemo(() => {
    const map: Record<number, number> = {}
    for (const sec of sections) {
      const year = sec.yearLevel?.level ?? 0
      if (year > 0) map[year] = (map[year] ?? 0) + 1
    }
    return map
  }, [sections])

  function calcLoadFromCounts(counts: SectionCountMap) {
    return Object.entries(counts).reduce((sum, [title, secCount]) => {
      const info = subjectInfoMap[title]
      if (!info || secCount <= 0) return sum
      return sum + info.units * secCount
    }, 0)
  }

  function getSpecsFromCounts(counts: SectionCountMap): string[] {
    return Object.entries(counts).filter(([, c]) => c > 0).map(([title]) => title)
  }

  function getMaxSections(title: string): number {
    const info = subjectInfoMap[title]
    if (!info) return 1
    return sectionCountByYear[info.year] ?? 1
  }

  // ── Add form helpers ──
  function setAddSectionCount(title: string, count: number) {
    setAddForm(f => {
      const newCounts = { ...f.sectionCounts }
      if (count <= 0) { delete newCounts[title] } else { newCounts[title] = Math.min(count, getMaxSections(title)) }
      return { ...f, sectionCounts: newCounts }
    })
  }

  function toggleAddSubject(title: string) {
    setAddForm(f => {
      const newCounts = { ...f.sectionCounts }
      if (newCounts[title]) { delete newCounts[title] } else { newCounts[title] = 1 }
      return { ...f, sectionCounts: newCounts }
    })
  }

  // ── Edit form helpers ──
  function setEditSectionCount(title: string, count: number) {
    setEditForm(f => {
      const newCounts = { ...f.sectionCounts }
      if (count <= 0) { delete newCounts[title] } else { newCounts[title] = Math.min(count, getMaxSections(title)) }
      return { ...f, sectionCounts: newCounts }
    })
  }

  function toggleEditSubject(title: string) {
    setEditForm(f => {
      const newCounts = { ...f.sectionCounts }
      if (newCounts[title]) { delete newCounts[title] } else { newCounts[title] = 1 }
      return { ...f, sectionCounts: newCounts }
    })
  }

  // Users not yet registered as faculty.
  // For ADMIN (Program Chair): the users API is SUPER_ADMIN-only, so approvedUsers will be empty.
  // Instead, inject the current user themselves so they can register as faculty in their own program.
  const availableUsers = useMemo(() => {
    const facultyUserIds = new Set(faculty.map((f: any) => f.userId))

    if (isAdmin && currentUser) {
      // Program Chair can only add themselves
      if (facultyUserIds.has(currentUser.id)) return [] // already faculty
      return [currentUser]
    }

    // SUPER_ADMIN: show all approved users not yet faculty
    return approvedUsers.filter((u: any) => !facultyUserIds.has(u.id))
  }, [approvedUsers, faculty, isAdmin, currentUser])

  const selectedUser = useMemo(
    () => availableUsers.find((u: any) => u.id === addForm.userId),
    [availableUsers, addForm.userId]
  )

  const filtered = faculty.filter((f: any) => {
    const name = `${f.user?.firstName ?? ""} ${f.user?.lastName ?? ""}`.toLowerCase()
    const email = f.user?.email?.toLowerCase() ?? ""
    return name.includes(search.toLowerCase()) || email.includes(search.toLowerCase())
  })

  // Group filtered faculty by department for the desktop table
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; abbr: string; members: any[] }>()
    for (const f of filtered) {
      const key = f.department?.id ?? "__none__"
      const label = f.department?.name ?? "Unassigned"
      const abbr = f.department?.abbreviation ?? "—"
      if (!map.has(key)) map.set(key, { label, abbr, members: [] })
      map.get(key)!.members.push(f)
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [filtered])

  function buildSectionCounts(f: any): SectionCountMap {
    const saved = f.sectionCounts as SectionCountMap | null
    if (saved && typeof saved === "object" && Object.keys(saved).length > 0) {
      const valid: SectionCountMap = {}
      for (const [title, count] of Object.entries(saved)) {
        if (subjectTitles.includes(title) && count > 0) valid[title] = count
      }
      return valid
    }
    const specs = (f.specializations ?? []).filter((s: string) => subjectTitles.includes(s))
    const counts: SectionCountMap = {}
    for (const s of specs) counts[s] = 1
    return counts
  }

  // ── Handlers ──
  async function handleAdd() {
    const { userId, firstName, lastName, sectionCounts, maxUnitsPerWeek, hoursPerWeek } = addForm
    const specs = getSpecsFromCounts(sectionCounts)

    try {
      if (addMode === "new") {
        // Create a brand-new faculty person — always in the current user's own department
        if (!firstName.trim()) return toast.error("First name is required")
        if (!lastName.trim()) return toast.error("Last name is required")
        if (!userDeptId) return toast.error("No department found. Please ensure your account has a department assigned.")
        await createFaculty.mutateAsync({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          departmentId: userDeptId,
          specializations: specs,
          sectionCounts,
          maxUnitsPerWeek,
          hoursPerWeek,
        })
      } else {
        if (!userId) return toast.error("Please select a faculty member")
        // Resolve department: from the matched available user, or from currentUser directly
        const user = availableUsers.find((u: any) => u.id === userId)
        const departmentId = user?.department?.id ?? user?.departmentId
        if (!departmentId) return toast.error("No department found. Please ensure your account has a department assigned.")
        await createFaculty.mutateAsync({ userId, departmentId, specializations: specs, sectionCounts, maxUnitsPerWeek, hoursPerWeek })
      }
      setAddOpen(false)
      setAddForm({ userId: "", firstName: "", lastName: "", sectionCounts: {}, maxUnitsPerWeek: 21, hoursPerWeek: 0 })
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  function openEdit(f: any) {
    setEditTarget(f)
    setEditForm({
      firstName: f.user?.firstName ?? "",
      lastName: f.user?.lastName ?? "",
      sectionCounts: buildSectionCounts(f),
      maxUnitsPerWeek: f.maxUnitsPerWeek,
      hoursPerWeek: f.hoursPerWeek ?? 0,
      isActive: f.isActive,
      clusterId: f.clusterId ?? "",
    })
    setEditOpen(true)
  }

  async function handleUpdate() {
    if (!editTarget) return
    // Preserve teaching-load entries belonging to OTHER programs on this shared
    // faculty record. `subjectTitles` (and therefore the SpecializationPicker
    // and buildSectionCounts) is scoped to the editing chair's own program — a
    // faculty who also teaches another program's subjects has those entries
    // filtered OUT of editForm.sectionCounts at open time. Saving editForm's
    // counts as-is would silently ERASE that other program's recorded load.
    // Re-merge them back in from the original record before sending the PATCH.
    const savedCounts = (editTarget.sectionCounts as SectionCountMap | null) ?? {}
    const foreignCounts: SectionCountMap = {}
    for (const [title, count] of Object.entries(savedCounts)) {
      if (!subjectTitles.includes(title) && count > 0) foreignCounts[title] = count
    }
    const mergedCounts = { ...foreignCounts, ...editForm.sectionCounts }
    const specs = getSpecsFromCounts(mergedCounts)
    try {
      await updateFaculty.mutateAsync({
        id: editTarget.id,
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        specializations: specs,
        sectionCounts: mergedCounts,
        maxUnitsPerWeek: editForm.maxUnitsPerWeek,
        hoursPerWeek: editForm.hoursPerWeek,
        isActive: editForm.isActive,
      })
      setEditOpen(false)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
    {/* flex/gap instead of space-y: space-y's margin-bottom lands on the sticky
        bar itself (it's not the last child), which throws off the browser's
        sticky release point and shows as a gap/overlap once you scroll. */}
    <div className="flex flex-col gap-6">
      {/* Sticky action bar: Add Faculty + Search + College filter, all in one
          top row. Uses a negative `top` (not a negative margin) to cancel
          <main>'s p-4 lg:p-6 padding — sticky's clamp only ever honors the
          `top` inset once pinned, so a negative margin here would leave the
          bar's stuck position sitting margin px lower than its resting one,
          exposing a sliver of whatever scrolls underneath every time it pins. */}
      <div className="sticky -top-4 z-20 border-b border-border bg-background pt-4 pb-4 lg:-top-6 lg:pt-6 lg:pb-6">
      <PageHeader
        action={
          <>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="mr-2 h-4 w-4" />Add Faculty
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Add Faculty</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Mode toggle: link an existing account vs. create a new person */}
                <div className="flex rounded-lg border border-input p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setAddMode("existing")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      addMode === "existing" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    Existing User
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode("new")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      addMode === "new" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    New Faculty
                  </button>
                </div>

                {addMode === "new" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label>First Name</Label>
                        <Input
                          value={addForm.firstName}
                          onChange={(e) => setAddForm(f => ({ ...f, firstName: e.target.value }))}
                          placeholder="Juan"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Last Name</Label>
                        <Input
                          value={addForm.lastName}
                          onChange={(e) => setAddForm(f => ({ ...f, lastName: e.target.value }))}
                          placeholder="Dela Cruz"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Added to your own department automatically.
                    </p>
                  </>
                ) : (
                <div className="grid gap-2">
                  <Label>Faculty</Label>
                  {isAdmin && availableUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground rounded-lg border border-input px-3 py-2 bg-muted/30">
                      You are already registered as a faculty member. Use <strong>New Faculty</strong> to add someone else.
                    </p>
                  ) : (
                    <select
                      value={addForm.userId}
                      onChange={(e) => setAddForm(f => ({ ...f, userId: e.target.value }))}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select a faculty member...</option>
                      {availableUsers.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName} ({u.email})
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedUser && (
                    <p className="text-xs text-muted-foreground">
                      {selectedUser.firstName} {selectedUser.lastName}
                      {selectedUser.department
                        ? ` · ${selectedUser.department.abbreviation} — ${selectedUser.department.name}`
                        : selectedUser.departmentId
                          ? ` · Department ID: ${selectedUser.departmentId}`
                          : " · No department assigned"}
                    </p>
                  )}
                  {selectedUser && !selectedUser.department && !selectedUser.departmentId && (
                    <p className="text-xs text-destructive">No department found. Contact the Department Chair to assign one.</p>
                  )}
                </div>
                )}

                {/* Max units / Hours */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Max Units / Week</Label>
                    <Input
                      type="number"
                      value={addForm.maxUnitsPerWeek}
                      onChange={(e) => setAddForm(f => ({ ...f, maxUnitsPerWeek: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-muted-foreground">Hours / Week</Label>
                    <Input type="number" value={0} disabled readOnly className="bg-muted/40" />
                    <p className="text-[10px] text-muted-foreground">Auto-calculated from the assigned schedule.</p>
                  </div>
                </div>

                <SpecializationPicker
                  sectionCounts={addForm.sectionCounts}
                  maxUnits={addForm.maxUnitsPerWeek}
                  subjectTitles={subjectTitles}
                  subjectInfoMap={subjectInfoMap}
                  sectionCountByYear={sectionCountByYear}
                  onToggle={toggleAddSubject}
                  onSetCount={setAddSectionCount}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={createFaculty.isPending}>
                  {createFaculty.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search faculty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          </>
        }
      />
      </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No faculty found"
          description={search ? "No faculty match your search." : "No faculty have been added yet."}
        />
      ) : (
        isMobile ? (
          /* ── Mobile: department-grouped card list ── */
          <MobileFacultyList
            grouped={grouped}
            expandedRows={expandedRows}
            subjectInfoMap={subjectInfoMap}
            onToggleRow={toggleRow}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
          />
        ) : (
        /* ── Desktop: department-grouped tables ── */
        <div className="space-y-5">
          {grouped.map(({ label, abbr, members }) => (
            <Card key={label}>
              {/* Department section header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b bg-[#1B4332]/5 rounded-t-lg">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1B4332] text-white text-xs font-bold shrink-0">
                  {abbr.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1B4332]">{label}</p>
                  <p className="text-[11px] text-muted-foreground">{members.length} {members.length === 1 ? "member" : "members"}</p>
                </div>
              </div>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Specializations & Load</TableHead>
                      <TableHead>Max Units</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((f: any) => {
                      const counts = buildSectionCounts(f)
                      const totalLoad = calcLoadFromCounts(counts)
                      const specEntries = Object.entries(counts).filter(([, c]) => c > 0)
                      return (
                        <TableRow key={f.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{f.user?.firstName} {f.user?.lastName}</p>
                              {f.user?.email && !f.user.email.endsWith("@faculty.slsu.edu.ph") && (
                                <p className="text-xs text-muted-foreground">{f.user.email}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {specEntries.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">No specializations</span>
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-1">
                                  {(expandedRows.has(f.id) ? specEntries : specEntries.slice(0, 3)).map(([title, count]) => {
                                    const info = subjectInfoMap[title]
                                    return (
                                      <Badge key={title} variant="secondary" className="text-xs">
                                        {title}: {count} cls
                                        <span className="ml-1 text-muted-foreground">({(info?.units ?? 0) * count}u)</span>
                                      </Badge>
                                    )
                                  })}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-[10px] text-muted-foreground">
                                    {specEntries.length} {specEntries.length === 1 ? 'subject' : 'subjects'} · {specEntries.reduce((a, [, c]) => a + c, 0)} classes · {totalLoad}u / {f.maxUnitsPerWeek}u
                                  </p>
                                  {specEntries.length > 3 && (
                                    <button
                                      type="button"
                                      onClick={() => toggleRow(f.id)}
                                      className="text-[10px] text-[#1B4332] font-medium hover:underline shrink-0"
                                    >
                                      {expandedRows.has(f.id) ? 'Show less' : `+${specEntries.length - 3} more`}
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{f.maxUnitsPerWeek}u/wk · {f.hoursPerWeek ?? 0}h/wk</TableCell>
                          <TableCell>
                            <Badge variant={f.isActive ? "default" : "secondary"}>
                              {f.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                                <MoreHorizontal className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(f)}>
                                  <Briefcase className="mr-2 h-4 w-4" />Edit Faculty
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteTarget(f)}>
                                  <Trash2 className="mr-2 h-4 w-4 text-red-600" />Delete Faculty
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
        )
      )}

      {/* Edit Faculty Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit — {editTarget?.user?.firstName} {editTarget?.user?.lastName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>First Name</Label>
                <Input value={editForm.firstName} onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Last Name</Label>
                <Input value={editForm.lastName} onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Max Units / Week</Label>
                <Input type="number" value={editForm.maxUnitsPerWeek} onChange={(e) => setEditForm(f => ({ ...f, maxUnitsPerWeek: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Hours / Week</Label>
                <Input type="number" value={editForm.hoursPerWeek} disabled readOnly className="bg-muted/40" />
                <p className="text-[10px] text-muted-foreground">Auto-calculated from the assigned schedule.</p>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <select
                  value={editForm.isActive ? "active" : "inactive"}
                  onChange={(e) => setEditForm(f => ({ ...f, isActive: e.target.value === "active" }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <SpecializationPicker
              sectionCounts={editForm.sectionCounts}
              maxUnits={editForm.maxUnitsPerWeek}
              subjectTitles={subjectTitles}
              subjectInfoMap={subjectInfoMap}
              sectionCountByYear={sectionCountByYear}
              onToggle={toggleEditSubject}
              onSetCount={setEditSectionCount}
            />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 sm:mr-auto"
              onClick={() => setDeleteTarget(editTarget)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateFaculty.isPending}>
                {updateFaculty.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Faculty confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete faculty?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes{" "}
            <strong className="text-foreground">
              {deleteTarget?.user ? `${deleteTarget.user.firstName} ${deleteTarget.user.lastName}` : "this faculty member"}
            </strong>{" "}
            along with their availability. Schedule entries already assigned to them will block the
            delete — reassign those first. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeleteFaculty}
              disabled={deleteFaculty.isPending}
            >
              {deleteFaculty.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RoleGuard>
  )
}
