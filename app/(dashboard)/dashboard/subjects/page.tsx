"use client"

import { useState, useMemo } from "react"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  BookOpen, Plus, Search, ChevronDown, ChevronRight, GraduationCap,
  Users2, Layers, Pencil, Trash2, Loader2, Building2, Send,
} from "lucide-react"
import { toast } from "sonner"
import { useColleges, useCreateSubject, useUpdateSubject, useDeleteSubject, useCreateSection, useUpdateSection, useDeleteSection } from "@/hooks/use-data"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { RoleGuard } from "@/components/shared/role-guard"
import { getCurriculumCodes, hasCurriculumMap } from "@/lib/curriculum-map"

const TYPE_COLORS: Record<string, string> = {
  LECTURE: "bg-blue-100 text-blue-800",
  LABORATORY: "bg-purple-100 text-purple-800",
}

const INITIAL_SUBJECT = { code: "", title: "", units: "3", type: "", departmentId: "", yearLevelId: "", semester: "FIRST", year: "1" }
const INITIAL_SECTION = { name: "", yearLevelId: "", capacity: "40" }

function SubjectTable({ subjects, onEdit, onDelete, displayYear, displaySemester }: {
  // onDelete receives the whole subject (not just its id) so the confirmation
  // dialog can name exactly what's about to be deleted.
  subjects: any[]; onEdit: (s: any) => void; onDelete: (s: any) => void;
  displayYear?: number; displaySemester?: string;
}) {
  if (subjects.length === 0) return null
  const yearLabel = (yr: number) => `${yr}${yr === 1 ? "st" : yr === 2 ? "nd" : yr === 3 ? "rd" : "th"}`
  const semLabel = (sem: string) => sem === "FIRST" ? "1st" : sem === "SECOND" ? "2nd" : "—"
  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Code</th>
            <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Title</th>
            <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Type</th>
            <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Units</th>
            <th className="px-3 py-1.5 w-16" />
          </tr>
        </thead>
        <tbody>
          {subjects.map((s: any) => (
            <tr key={s.id} className="border-t hover:bg-muted/20">
              <td className="px-3 py-1.5 font-mono text-xs font-medium">
                {s.code}
                {(s.code.startsWith("GEC") || s.code.startsWith("PATHFIT") || s.code.startsWith("PATHFit")) && (
                  <span className="ml-1 inline-flex rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0 text-[9px] font-medium">GEC</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-xs">{s.title}</td>
              <td className="px-3 py-1.5">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[s.type] ?? ""}`}>
                  {s.type}
                </span>
              </td>
              <td className="px-3 py-1.5 text-xs">{s.units}</td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <button onClick={() => onEdit(s)} className="p-1 rounded hover:bg-muted">
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button onClick={() => onDelete(s)} className="p-1 rounded hover:bg-muted">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CoursesPage() {
  const [search, setSearch] = useState("")
  const [semesterFilter, setSemesterFilter] = useState<string>("FIRST")
  const [expandedColleges, setExpandedColleges] = useState<Set<string>>(new Set())
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set())

  // Subject dialog
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [subjectForm, setSubjectForm] = useState(INITIAL_SUBJECT)
  const [editSubjectTarget, setEditSubjectTarget] = useState<any>(null)
  // Pending deletions — drive in-app confirmation dialogs instead of the
  // browser's native confirm(), which renders as a raw "localhost:3000 says"
  // popup and looks nothing like the rest of the app.
  const [deleteSubjectTarget, setDeleteSubjectTarget] = useState<any>(null)

  // Section dialog
  const [sectionOpen, setSectionOpen] = useState(false)
  const [sectionForm, setSectionForm] = useState(INITIAL_SECTION)
  const [editSectionTarget, setEditSectionTarget] = useState<any>(null)
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<any>(null)

  // Faculty request dialog
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestReason, setRequestReason] = useState("")
  const [requestSubjectId, setRequestSubjectId] = useState("")

  // Current user info
  const { data: currentUser } = useQuery({
    queryKey: ["current-user-role"],
    queryFn: async () => {
      const res = await fetch("/api/users/me")
      const json = await res.json()
      if (!res.ok) return { role: "FACULTY" }
      return json.data ?? { role: "FACULTY" }
    },
  })
  const userRole = (currentUser?.role ?? "FACULTY") as string
  const isSuperAdmin = userRole === "SUPER_ADMIN"
  const isAdmin = userRole === "ADMIN"

  const queryClient = useQueryClient()
  const { data: colleges = [], isLoading } = useColleges(semesterFilter)
  const createSubject = useCreateSubject()
  const updateSubject = useUpdateSubject()
  const deleteSubject = useDeleteSubject()
  const createSection = useCreateSection()
  const updateSection = useUpdateSection()
  const deleteSection = useDeleteSection()

  // Faculty request mutation
  const sendFacultyRequest = useMutation({
    mutationFn: async (data: { reason: string; subjectId?: string }) => {
      const res = await fetch("/api/faculty/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to send request")
      return json.data
    },
    onSuccess: () => {
      toast.success("Faculty request sent to Department Chair")
      setRequestOpen(false)
      setRequestReason("")
      setRequestSubjectId("")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function toggleCollege(id: string) {
    setExpandedColleges(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleProgram(id: string) {
    setExpandedPrograms(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openAddSubject(departmentId: string, yearLevelId?: string) {
    setEditSubjectTarget(null)
    setSubjectForm({ ...INITIAL_SUBJECT, departmentId, yearLevelId: yearLevelId ?? "", semester: semesterFilter || "FIRST" })
    setSubjectOpen(true)
  }

  function openEditSubject(s: any) {
    setEditSubjectTarget(s)
    setSubjectForm({
      code: s.code, title: s.title, units: String(s.units),
      type: s.type, departmentId: s.departmentId,
      yearLevelId: s.yearLevelId ?? "",
      semester: s.semester ?? "FIRST",
      year: String(s.year ?? 1),
    })
    setSubjectOpen(true)
  }

  function openAddSection(yearLevelId: string, programAbbr: string, level: number) {
    setEditSectionTarget(null)
    setSectionForm({ name: `${programAbbr} ${level}-`, yearLevelId, capacity: "40" })
    setSectionOpen(true)
  }

  function openEditSection(sec: any) {
    setEditSectionTarget(sec)
    setSectionForm({ name: sec.name, yearLevelId: sec.yearLevelId, capacity: String(sec.capacity) })
    setSectionOpen(true)
  }

  async function handleSubjectSubmit() {
    const { code, title, type, departmentId, yearLevelId, year, semester, units } = subjectForm
    if (!code || !title || !type || !departmentId) return toast.error("Fill in all required fields")

    // Units is held as a string so the field can actually be emptied while typing
    // (a numeric state would coerce "" back to 0 and make the default impossible to
    // backspace). That means the emptied value has to be rejected here — otherwise
    // PATCH turned "" into 0 units and saved it silently.
    const unitsValue = Number(units)
    if (String(units).trim() === "" || !Number.isFinite(unitsValue) || unitsValue <= 0) {
      return toast.error("Units must be a number greater than 0")
    }

    // ── Auto-align yearLevelId to match the selected year ───────────────────
    // If yearLevelId doesn't match the chosen year, find the correct one
    let resolvedYearLevelId = yearLevelId
    if (year) {
      const matched = (colleges as any[])
        .flatMap((c: any) => c.departments ?? [])
        .filter((d: any) => d.id === departmentId)
        .flatMap((d: any) => d.programs ?? [])
        .flatMap((p: any) => p.yearLevels ?? [])
        .find((yl: any) => String(yl.level) === String(year))
      if (matched) resolvedYearLevelId = matched.id
    }

    // ── Duplicate subject code check ────────────────────────────────────────
    // A subject code must not appear more than once in the same department
    const allDeptSubjects: any[] = (colleges as any[])
      .flatMap((c: any) => c.departments ?? [])
      .filter((d: any) => d.id === departmentId)
      .flatMap((d: any) => d.subjects ?? [])

    const existingWithSameCode = allDeptSubjects.filter(
      (s: any) => s.code.toLowerCase() === code.toLowerCase() &&
        (!editSubjectTarget || s.id !== editSubjectTarget.id)
    )
    if (existingWithSameCode.length > 0) {
      const existing = existingWithSameCode[0]
      return toast.error(
        `"${code}" already exists in this department (${existing.semester === 'FIRST' ? '1st' : '2nd'} Semester, Year ${existing.year}). A subject code can only appear once per department.`
      )
    }

    try {
      if (editSubjectTarget) {
        await updateSubject.mutateAsync({
          id: editSubjectTarget.id,
          code: subjectForm.code,
          title: subjectForm.title,
          units: subjectForm.units,
          hoursPerWeek: subjectForm.units,
          type: subjectForm.type,
          departmentId: subjectForm.departmentId,
          yearLevelId: resolvedYearLevelId || null,
          semester: subjectForm.semester,
          year: subjectForm.year,
        })
      } else {
        const payload = {
          ...subjectForm,
          hoursPerWeek: subjectForm.units,
          yearLevelId: resolvedYearLevelId || null,
        }
        await createSubject.mutateAsync(payload)
        if (subjectForm.semester && subjectForm.semester !== semesterFilter) {
          setSemesterFilter(subjectForm.semester)
        }
      }
      setSubjectOpen(false)
      setEditSubjectTarget(null)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleDeleteSubject() {
    if (!deleteSubjectTarget) return
    try {
      await deleteSubject.mutateAsync(deleteSubjectTarget.id)
      setDeleteSubjectTarget(null)
    } catch (err: any) { toast.error(err.message) }
  }

  async function handleSectionSubmit() {
    const { name, yearLevelId, capacity } = sectionForm
    if (!name || !yearLevelId) return toast.error("Fill in all required fields")
    const capacityValue = Number(capacity)
    if (String(capacity).trim() === "" || !Number.isFinite(capacityValue) || capacityValue <= 0) {
      return toast.error("Capacity must be a number greater than 0")
    }
    try {
      if (editSectionTarget) {
        await updateSection.mutateAsync({ id: editSectionTarget.id, ...sectionForm, capacity: Number(sectionForm.capacity) })
      } else {
        await createSection.mutateAsync({ ...sectionForm, capacity: Number(sectionForm.capacity) })
      }
      setSectionOpen(false)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleDeleteSection() {
    if (!deleteSectionTarget) return
    try {
      await deleteSection.mutateAsync(deleteSectionTarget.id)
      setDeleteSectionTarget(null)
      setSectionOpen(false)
    } catch (err: any) { toast.error(err.message) }
  }

  // Filter colleges by search
  const filtered = search
    ? colleges.filter((c: any) => {
        const term = search.toLowerCase()
        if (c.name.toLowerCase().includes(term) || c.abbreviation.toLowerCase().includes(term)) return true
        return c.departments?.some((d: any) =>
          d.programs?.some((p: any) =>
            p.name.toLowerCase().includes(term) || p.abbreviation.toLowerCase().includes(term)
          ) ||
          d.subjects?.some((s: any) =>
            s.code.toLowerCase().includes(term) || s.title.toLowerCase().includes(term)
          )
        )
      })
    : colleges

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
    <div className="space-y-6">
      <PageHeader
        action={
          isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
              <Send className="mr-2 h-4 w-4" />
              Request Faculty
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search colleges, programs, subjects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Semester Filter */}
        <div className="flex items-center rounded-lg border bg-background p-0.5">
          <button
            onClick={() => setSemesterFilter("FIRST")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              semesterFilter === "FIRST"
                ? "bg-[#1B4332] text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            1st Semester
          </button>
          <button
            onClick={() => setSemesterFilter("SECOND")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              semesterFilter === "SECOND"
                ? "bg-[#1B4332] text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            2nd Semester
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No colleges found" description="No data matches your search." />
      ) : (
        <div className="space-y-3">
          {filtered.map((college: any) => {
            const depts = college.departments ?? []
            const isExpanded = expandedColleges.has(college.id)
            const programCount = depts.reduce((acc: number, d: any) => acc + (d.programs?.length ?? 0), 0)
            const subjectCount = depts.reduce((acc: number, d: any) => acc + (d.subjects?.length ?? 0), 0)

            return (
              <Card key={college.id} className="overflow-hidden">
                {/* College Header */}
                <button
                  onClick={() => toggleCollege(college.id)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <Building2 className="h-5 w-5 text-[#1B4332] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{college.name}</p>
                    <p className="text-xs text-muted-foreground">{programCount} programs &middot; {subjectCount} subjects ({semesterFilter === "FIRST" ? "1st Semester" : "2nd Semester"})</p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">{college.abbreviation}</Badge>
                </button>

                {/* Expanded Content */}
                {isExpanded && depts.length > 0 && (
                  <CardContent className="border-t pt-4 space-y-4">
                    {depts.map((dept: any, deptIdx: number) => {
                      const allDeptSubjects: any[] = dept.subjects ?? []
                      const showDeptHeader = depts.length > 1
                      return (
                        <div key={dept.id} className={deptIdx > 0 ? "border-t pt-4" : ""}>
                          {/* Sub-department header — shown when college has multiple sub-depts (e.g. CAS → SS/LLH/MNS) */}
                          {showDeptHeader && (
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-sm font-semibold text-[#1B4332]">{dept.name}</span>
                              <Badge variant="outline" className="text-xs font-mono">{dept.abbreviation}</Badge>
                            </div>
                          )}

                          {/* Programs */}
                          {(dept.programs ?? []).length > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Programs / Courses</h4>
                              </div>
                              <div className="space-y-2">
                                {dept.programs.map((prog: any) => {
                                  const progExpanded = expandedPrograms.has(prog.id)
                                  const hasMap = hasCurriculumMap(prog.abbreviation)
                                  return (
                                    <div key={prog.id} className="rounded-lg border">
                                      <button
                                        onClick={() => toggleProgram(prog.id)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                                      >
                                        {progExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                        <GraduationCap className="h-4 w-4 text-[#D4AF37]" />
                                        <span className="text-sm font-medium flex-1">{prog.name}</span>
                                        <Badge variant="secondary" className="text-xs font-mono">{prog.abbreviation}</Badge>
                                      </button>
                                      {progExpanded && (
                                        <div className="border-t px-3 py-3 bg-muted/10 space-y-4">
                                          {/* Year Levels with Sections AND Subjects */}
                                          <div className="space-y-4">
                                            {(prog.yearLevels ?? []).map((yl: any) => {
                                              // Use curriculum map for precise subject placement per program/year/semester
                                              const ylSubjects = hasMap
                                                ? (() => {
                                                    // The curriculum map already encodes year+semester placement.
                                                    // Do NOT also filter by s.semester — GEC subjects carry their
                                                    // canonical dept semester which may differ from program placement.
                                                    const codes = getCurriculumCodes(prog.abbreviation, yl.level, semesterFilter as "FIRST" | "SECOND")
                                                    const codeSetLower = new Set(codes.map(c => c.toLowerCase()))
                                                    return allDeptSubjects.filter((s: any) =>
                                                      codeSetLower.has((s.code ?? "").toLowerCase())
                                                    )
                                                  })()
                                                : allDeptSubjects.filter((s: any) =>
                                                    (s.yearLevelId === yl.id || (!s.yearLevelId && s.year === yl.level)) &&
                                                    s.semester === semesterFilter
                                                  )
                                              return (
                                                <div key={yl.id} className="space-y-2">
                                                  <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                                      <span className="text-xs font-semibold">Year {yl.level}</span>
                                                      <Badge variant="outline" className="text-[10px]">
                                                        {ylSubjects.length} subjects
                                                      </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-2 text-xs"
                                                        onClick={() => openAddSection(yl.id, prog.abbreviation, yl.level)}
                                                      >
                                                        <Plus className="h-3 w-3 mr-1" />Section
                                                      </Button>
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-6 px-2 text-xs"
                                                        onClick={() => openAddSubject(dept.id, yl.id)}
                                                      >
                                                        <Plus className="h-3 w-3 mr-1" />Subject
                                                      </Button>
                                                    </div>
                                                  </div>
                                                  {/* Sections */}
                                                  <div className="flex flex-wrap gap-1.5 ml-5">
                                                    {(yl.sections ?? []).map((sec: any) => (
                                                      <button
                                                        key={sec.id}
                                                        onClick={() => openEditSection(sec)}
                                                        className="inline-flex items-center gap-1 rounded-md bg-card border px-2 py-0.5 text-xs hover:bg-muted/50 transition-colors"
                                                      >
                                                        <Users2 className="h-3 w-3 text-muted-foreground" />
                                                        {sec.name}
                                                      </button>
                                                    ))}
                                                    {(yl.sections ?? []).length === 0 && (
                                                      <span className="text-xs text-muted-foreground italic">No sections</span>
                                                    )}
                                                  </div>
                                                  {/* Subjects for this year level */}
                                                  {ylSubjects.length > 0 && (
                                                    <div className="ml-5">
                                                      <SubjectTable subjects={ylSubjects} onEdit={openEditSubject} onDelete={setDeleteSubjectTarget} displayYear={yl.level} displaySemester={semesterFilter} />
                                                    </div>
                                                  )}
                                                  {ylSubjects.length === 0 && (
                                                    <p className="ml-5 text-xs text-muted-foreground italic">No subjects for {semesterFilter === "FIRST" ? "1st" : "2nd"} semester</p>
                                                  )}
                                                </div>
                                              )
                                            })}
                                            {(prog.yearLevels ?? []).length === 0 && (
                                              <p className="text-xs text-muted-foreground italic">No year levels configured</p>
                                            )}
                                          </div>

                                          {/* General / Unassigned Subjects (only for programs without curriculum map) */}
                                          {!hasMap && (() => {
                                            const yearLevels = (prog.yearLevels ?? []).map((yl: any) => yl.level)
                                            const unassigned = allDeptSubjects.filter((s: any) => !s.yearLevelId && !yearLevels.includes(s.year))
                                            if (unassigned.length === 0) return null
                                            return (
                                              <div>
                                                <div className="flex items-center justify-between mb-2">
                                                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                                    <BookOpen className="h-3 w-3" />
                                                    General / Unassigned Subjects
                                                  </h5>
                                                  <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => openAddSubject(dept.id)}>
                                                    <Plus className="h-3 w-3 mr-1" />Add Subject
                                                  </Button>
                                                </div>
                                                <SubjectTable subjects={unassigned} onEdit={openEditSubject} onDelete={setDeleteSubjectTarget} />
                                              </div>
                                            )
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Department-level subjects for depts without programs (CAS GEC sub-depts: SS, LLH, MNS) */}
                          {(dept.programs ?? []).length === 0 && (() => {
                            const deptSubjects = allDeptSubjects.filter((s: any) => s.semester === semesterFilter)
                            if (deptSubjects.length === 0) {
                              return (
                                <div className="flex items-center justify-between">
                                  <p className="text-sm text-muted-foreground italic">No subjects for {semesterFilter === "FIRST" ? "1st" : "2nd"} semester</p>
                                  <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => openAddSubject(dept.id)}>
                                    <Plus className="h-3 w-3 mr-1" />Add Subject
                                  </Button>
                                </div>
                              )
                            }
                            const years = [...new Set(deptSubjects.map((s: any) => s.year as number))].sort((a, b) => a - b)
                            return (
                              <div className="space-y-4">
                                {years.map(yr => {
                                  const yrSubjects = deptSubjects.filter((s: any) => s.year === yr)
                                  return (
                                    <div key={yr} className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="text-xs font-semibold">Year {yr}</span>
                                          <Badge variant="outline" className="text-[10px]">{yrSubjects.length} subjects</Badge>
                                        </div>
                                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => openAddSubject(dept.id)}>
                                          <Plus className="h-3 w-3 mr-1" />Subject
                                        </Button>
                                      </div>
                                      <div className="ml-5">
                                        <SubjectTable subjects={yrSubjects} onEdit={openEditSubject} onDelete={setDeleteSubjectTarget} />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Subject Dialog */}
      <Dialog open={subjectOpen} onOpenChange={(open) => {
        setSubjectOpen(open)
        if (!open) setEditSubjectTarget(null)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editSubjectTarget ? "Edit Subject" : "Add Subject"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Subject Code</Label>
                <Input placeholder="e.g. BOT01" value={subjectForm.code} onChange={(e) => setSubjectForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Units</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="e.g. 3"
                  value={subjectForm.units}
                  onChange={(e) => setSubjectForm(f => ({ ...f, units: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input placeholder="e.g. General Botany" value={subjectForm.title} onChange={(e) => setSubjectForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={subjectForm.type} onValueChange={(v) => v && setSubjectForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LECTURE">Lecture</SelectItem>
                  <SelectItem value="LABORATORY">Laboratory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Semester</Label>
                <Select value={subjectForm.semester} onValueChange={(v) => v && setSubjectForm(f => ({ ...f, semester: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIRST">1st Semester</SelectItem>
                    <SelectItem value="SECOND">2nd Semester</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Year Level</Label>
                <Select value={subjectForm.year} onValueChange={(v) => v && setSubjectForm(f => ({ ...f, year: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Year</SelectItem>
                    <SelectItem value="2">2nd Year</SelectItem>
                    <SelectItem value="3">3rd Year</SelectItem>
                    <SelectItem value="4">4th Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubjectOpen(false)}>Cancel</Button>
            <Button onClick={handleSubjectSubmit} disabled={createSubject.isPending || updateSubject.isPending}>
              {(createSubject.isPending || updateSubject.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editSubjectTarget ? "Save" : "Add Subject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section Dialog */}
      <Dialog open={sectionOpen} onOpenChange={setSectionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editSectionTarget ? "Edit Section" : "Add Section"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Section Name</Label>
              <Input placeholder="e.g. BSBio 1-A" value={sectionForm.name} onChange={(e) => setSectionForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Capacity</Label>
              <Input
                type="number"
                min={1}
                step={1}
                placeholder="e.g. 40"
                value={sectionForm.capacity}
                onChange={(e) => setSectionForm(f => ({ ...f, capacity: e.target.value }))}
              />
            </div>
            {editSectionTarget && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteSectionTarget(editSectionTarget)}>
                <Trash2 className="mr-2 h-4 w-4" />Delete Section
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionOpen(false)}>Cancel</Button>
            <Button onClick={handleSectionSubmit} disabled={createSection.isPending || updateSection.isPending}>
              {(createSection.isPending || updateSection.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editSectionTarget ? "Save" : "Add Section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete subject confirmation */}
      <Dialog open={!!deleteSubjectTarget} onOpenChange={(o) => !o && setDeleteSubjectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete subject?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes{" "}
            <strong className="text-foreground">
              {deleteSubjectTarget?.code}
              {deleteSubjectTarget?.title ? ` — ${deleteSubjectTarget.title}` : ""}
            </strong>
            . Any schedule entries already using it will block the delete. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSubjectTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeleteSubject}
              disabled={deleteSubject.isPending}
            >
              {deleteSubject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete section confirmation */}
      <Dialog open={!!deleteSectionTarget} onOpenChange={(o) => !o && setDeleteSectionTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete section?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes{" "}
            <strong className="text-foreground">{deleteSectionTarget?.name ?? "this section"}</strong>
            . Any schedule entries for it will block the delete. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSectionTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeleteSection}
              disabled={deleteSection.isPending}
            >
              {deleteSection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Faculty Request Dialog (Program Chair only) */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Faculty from Department Chair</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              If you lack faculty to handle a subject, send a request to the Department Chairperson (CAS) for assistance.
            </p>
            <div className="grid gap-2">
              <Label>Subject (optional)</Label>
              <Input
                placeholder="e.g. General Botany"
                value={requestSubjectId}
                onChange={(e) => setRequestSubjectId(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Reason / Details</Label>
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px]"
                placeholder="Explain why additional faculty is needed..."
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendFacultyRequest.mutate({ reason: requestReason, subjectId: requestSubjectId || undefined })}
              disabled={!requestReason || sendFacultyRequest.isPending}
            >
              {sendFacultyRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RoleGuard>
  )
}
