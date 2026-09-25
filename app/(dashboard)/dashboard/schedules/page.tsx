"use client"

import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { PageHeader } from "@/components/shared/page-header"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CalendarDays,
  Globe,
  BellRing,
  BookOpen,
  Filter,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Trash2,
  Pencil,
  Archive,
  ArchiveRestore,
  FileDown,
  Cpu,
  Undo2,
  Search,
  X,
  Workflow,
  Circle,
  Rows3,
  ChevronDown,
  ChevronUp,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import {
  useSchedules,
  useSchedule,
  useCreateSchedule,
  useGenerateSchedule,
  useUpdateScheduleTerm,
  useCreateEntry,
  useUpdateEntry,
  useDeleteEntry,
  useDeleteSchedule,
  usePublishSchedule,
  useUnpublishSchedule,
  useArchiveSchedule,
  useFaculty,
  useRooms,
} from "@/hooks/use-schedules"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { useSubjects, useSections, useDepartments } from "@/hooks/use-data"
import { RoleGuard } from "@/components/shared/role-guard"
import { useRealtimeSchedules } from "@/hooks/use-realtime"
import { getCurriculumCodes, hasCurriculumMap } from "@/lib/curriculum-map"
import { isGeUnitRole, geUnitOwnsCode, isNstpCode } from "@/lib/roles"
// Same matcher the server validates with, so the picker never offers a faculty
// member that saving would then reject. See lib/specialization-match.ts.
import { facultyMatchesSubject } from "@/lib/specialization-match"
import { GYM_ROOM_CODE, PATHFIT_FACULTY_LABEL, isPathfitCode, isPlaceholderRoomCode, isTbaFacultyEmployeeId } from "@/lib/sentinels"
import { roomTypeAllowedForSubject } from "@/lib/room-type-rules"
// Per-day session cap (GEC/GEL 1h / 1h 30min) — same rule the server and the
// generator enforce, so the End Time picker never offers a length the save
// would reject. See lib/session-rules.ts.
import { resolveMaxMinutesPerDay, formatMinutes } from "@/lib/session-rules"
import { PaginationControls, usePagination } from "@/components/shared/pagination"
import { WorkflowActions } from "@/components/schedule/workflow-actions"

import { LabRequestsPanel } from "@/components/schedule/lab-requests-panel"
import Link from "next/link"

// Both of these are heavy and neither is needed for the default List view, so they
// load on demand instead of shipping in this route's initial JS:
//   ScheduleCalendar — pulls in the four @fullcalendar packages.
//   ExportDialog     — only ever opened from the Export action.
// ssr:false because both are browser-only anyway (this is a "use client" page).
const ScheduleCalendar = dynamic(
  () => import("@/components/schedule/schedule-calendar").then((m) => m.ScheduleCalendar),
  {
    ssr: false,
    loading: () => <CalendarSkeleton />,
  }
)
const ExportDialog = dynamic(
  () => import("@/components/schedule/export-dialog").then((m) => m.ExportDialog),
  { ssr: false }
)
import { useCollege } from "@/lib/college-context"
import { DAY_LABELS } from "@/lib/constants"
import { CalendarSkeleton, ScheduleListSkeleton, ScheduleDetailSkeleton } from "@/components/shared/loading-skeletons"

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
// Full day names for the day tabs / banners (DAY_LABELS from lib/constants is the short "Mon" form).
const DAY_FULL: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday",
}

// Saturday classes are reserved for CAM (College of Allied Medicine) sections
// and NSTP subjects — mirrors the engine/API hard constraint.
function subjectAllowsSaturday(subject: any): boolean {
  const code = (subject?.code ?? "").toUpperCase()
  return code.startsWith("NSTP") || code.startsWith("NST")
}
function sectionAllowsSaturday(section: any): boolean {
  return section?.yearLevel?.program?.department?.college?.abbreviation === "CAM"
}

// Stable reference so a fallback `?? EMPTY_STRING_ARRAY` never defeats a useMemo's
// dependency check the way a fresh `?? []` literal would on every render.
const EMPTY_STRING_ARRAY: string[] = []



/**
 * Item 7 — the class a required field gets once a save attempt found it blank.
 * Applied on top of each control's own classes so the red ring wins.
 */
function missingRing(missing: string[], field: string): string {
  return missing.includes(field)
    ? " border-red-500 ring-1 ring-red-500 focus:ring-red-500 focus-visible:ring-red-500"
    : ""
}

// Classes run 7:30 AM-8:00 PM (26 half-hour marks, 7:30 through 20:00 inclusive).
// Capping the shared option list here — rather than only the End Time picker —
// means the Start Time picker also never offers a start with nowhere left to end.
const TIME_OPTIONS = Array.from({ length: 26 }, (_, i) => {
  const totalMins = 7 * 60 + 30 + i * 30
  const h = String(Math.floor(totalMins / 60)).padStart(2, "0")
  const m = String(totalMins % 60).padStart(2, "0")
  return `${h}:${m}`
})

/**
 * Opens the schedule named by ?schedule=<id> — the link every workflow
 * notification (submitted / approved / returned / everyone done) and the Dean's
 * dashboard use. The parameter is dropped once applied, so choosing another
 * schedule and reloading doesn't jump back. Lives in its own Suspense-wrapped
 * component because useSearchParams needs one.
 */
function ScheduleDeepLink({ onOpen }: { onOpen: (scheduleId: string) => void }) {
  const searchParams = useSearchParams()
  const scheduleId = searchParams.get("schedule")
  useEffect(() => {
    if (!scheduleId) return
    onOpen(scheduleId)
    const url = new URL(window.location.href)
    url.searchParams.delete("schedule")
    window.history.replaceState(null, "", url.pathname + url.search + url.hash)
  }, [scheduleId])
  return null
}

function ScheduleStatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const variants: Record<string, { label: string; className: string }> = {
    DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
    PENDING_APPROVAL: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
    PUBLISHED: { label: "Published", className: "bg-green-100 text-green-800" },
    ARCHIVED: { label: "Archived", className: "bg-secondary text-secondary-foreground" },
  }
  const v = variants[status] ?? variants.DRAFT
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.className}`}>
      {v.label}
    </span>
  )
}

export default function SchedulesPage() {
  const [tab, setTab] = useState("active")
  const [deptFilter, setDeptFilter] = useState("")   // department filter inside the schedule list
  const [semFilter, setSemFilter] = useState("")     // semester type filter (FIRST | SECOND | SUMMER)
  const [view, setView] = useState("list")
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)

  // ── Supabase Realtime: live updates when other users add/edit/delete entries ──
  useRealtimeSchedules(selectedScheduleId)
  const [createOpen, setCreateOpen] = useState(false)
  // Term correction on a DRAFT schedule — see the Edit Term dialog below.
  const [editTermOpen, setEditTermOpen] = useState(false)
  const [termForm, setTermForm] = useState({ semesterType: "", schoolYear: "", startDate: "", endDate: "" })
  const [generateOpen, setGenerateOpen] = useState(false)
  const [addEntryOpen, setAddEntryOpen] = useState(false)
  const [editEntryOpen, setEditEntryOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  // Workflow Guide moved out of the toolbar into the ⋯ overflow menu, so its
  // dialog is opened from here instead of by its own standalone button.
  const [newSemType, setNewSemType] = useState("")
  const [newSchoolYear, setNewSchoolYear] = useState("")
  // Department the new schedule is for. Dept Chairs pick it (they create the
  // schedule for each department before plotting GEC); Program Chairs are
  // locked to their own department server-side, so the picker stays hidden.
  const [newDeptId, setNewDeptId] = useState("")
  // Item 7 — names of required fields left blank on the last save attempt, so the
  // form can ring them in red instead of only firing a toast that names one of them.
  const [createMissing, setCreateMissing] = useState<string[]>([])
  const [entryMissing, setEntryMissing] = useState<string[]>([])
  const [editMissing, setEditMissing] = useState<string[]>([])
  const [newStartDate, setNewStartDate] = useState("")
  const [newEndDate, setNewEndDate] = useState("")

  const [entryForm, setEntryForm] = useState({
    subjectId: "",
    facultyId: "",
    facultyName: "",   // free-text override — sent alongside facultyId
    roomId: "",
    sectionId: "",
    day: "",
    startTime: "",
    endTime: "",
    set: "" as "" | "A" | "B",
  })
  // Day pattern for Add Entry — "single" keeps the one-day <select>; MWF/TTh
  // are quick presets; "custom" shows a checkbox list of individually-picked
  // days. All of MWF/TTh/custom create one entry per day sharing a groupId
  // (same shape the auto-generator already produces for multi-day classes),
  // so list/calendar grouping and delete-as-one-unit work unchanged.
  const [dayPattern, setDayPattern] = useState<"single" | "MWF" | "TTH" | "custom">("single")
  const [customDays, setCustomDays] = useState<string[]>([])
  // "Split into lab sets" — creates Set A and Set B in one submission, each with
  // its own Room/Day/Time, sharing the Section/Subject/Faculty above. Only offered
  // when neither set has been placed yet (see the toggle's gating condition below) —
  // once one exists, the ordinary single-Set picker (already in the form) covers
  // adding the other.
  const [splitLabSets, setSplitLabSets] = useState(false)
  const [setAEntry, setSetAEntry] = useState({ roomId: "", day: "", startTime: "", endTime: "" })
  const [setBEntry, setSetBEntry] = useState({ roomId: "", day: "", startTime: "", endTime: "" })
  // Merged NSTP class — extra sections that take this class together with the
  // primary Section above (same faculty, room, day and time). Sent to the POST
  // route as `sectionIds`; every row shares a mergeGroupId server-side.
  const [mergeSectionIds, setMergeSectionIds] = useState<string[]>([])
  // Edit dialog: the full section list of a merged NSTP class (add / remove).
  const [editMergeSectionIds, setEditMergeSectionIds] = useState<string[]>([])
  const [editMergeAddId, setEditMergeAddId] = useState("")
  // Controls the faculty autocomplete dropdown visibility
  const [facultySearch, setFacultySearch] = useState("")
  const [facultyDropdownOpen, setFacultyDropdownOpen] = useState(false)
  const facultyComboRef = useRef<HTMLDivElement>(null)

  // Delete confirmation dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Pre-publish validation dialog
  const [publishValidationOpen, setPublishValidationOpen] = useState(false)
  const [publishValidation, setPublishValidation] = useState<{
    loading: boolean
    errors: { type: string; description: string }[]
    warnings: { type: string; description: string }[]
    entryCount: number
  }>({ loading: false, errors: [], warnings: [], entryCount: 0 })

  const [sectionSearch, setSectionSearch] = useState("")
  const [sectionDropdownOpen, setSectionDropdownOpen] = useState(false)
  const sectionComboRef = useRef<HTMLDivElement>(null)

  // Close section dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sectionComboRef.current && !sectionComboRef.current.contains(e.target as Node)) {
        setSectionDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Close faculty autocomplete dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (facultyComboRef.current && !facultyComboRef.current.contains(e.target as Node)) {
        setFacultyDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Fetch current user role for access control. `isPending` matters here: the
  // `userRole` default below falls back to "FACULTY" while this is in flight, which
  // used to briefly render the "available to Chairpersons only" warning for every
  // real chair on every navigation to this page, before their actual role loaded.
  const { data: currentUser, isPending: currentUserPending } = useQuery({
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
  // DEAN: read-only everywhere except the approval strip (Approve / Return for
  // revision on their department's submitted schedule — WorkflowActions).
  const isDean = userRole === "DEAN"
  // PATHFIT / NSTP Directors: their own subject family, in every college.
  const isGeUnit = isGeUnitRole(userRole)

  // College filter from topbar — university-wide roles (Dept Chairs, the
  // PATHFit / NSTP coordinators) see ALL schedules because their subjects go
  // into every program's schedule. ADMIN (Program Chair) and DEAN keep the
  // (locked) college filter.
  const { selectedCollegeId } = useCollege()
  const scheduleCollegeFilter = isSuperAdmin || isGeUnit ? undefined : selectedCollegeId

  const { data: activeSchedules = [], isLoading: loadingActive } = useSchedules(undefined, false, scheduleCollegeFilter)
  // Archived schedules are behind their own tab, but this fired on every visit to
  // the page — a second full schedules request nobody had asked to see yet. It now
  // loads the first time that tab is opened, and React Query keeps it cached after.
  const { data: archivedSchedules = [], isLoading: loadingArchived } = useSchedules(
    undefined, true, scheduleCollegeFilter, { enabled: tab === "archived" }
  )
  const { data: selectedSchedule, isLoading: loadingSchedule } = useSchedule(selectedScheduleId)
  const queryClient = useQueryClient()
  // Tracks which Mark-Resolved PATCH is in flight (per-item spinner)
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null)
  // Conflicts / Unassigned Queue sit above the entry list; collapsible so a long
  // list of either never pushes the schedule itself off-screen.
  const [conflictsOpen, setConflictsOpen] = useState(true)
  const [unassignedOpen, setUnassignedOpen] = useState(true)
  // Client-side-only dismiss for the rejection-reason banner — keyed on
  // `${scheduleId}:${updatedAt}` so a fresh rejection (new updatedAt) re-shows it
  // even if the chair had dismissed a previous rejection on this same schedule.
  const [dismissedRejectionKey, setDismissedRejectionKey] = useState<string | null>(null)
  // Derive schedule semester type (FIRST | SECOND | SUMMER) for subject filtering
  const scheduleSemesterType = selectedSchedule?.semester?.type as string | undefined
  // These are only ever read inside the Add/Edit Entry dialogs, so they stay gated —
  // the schedule list on its own must not fetch and hold several hundred KB of
  // university-wide sections/subjects/faculty.
  //
  // They warm on schedule SELECTION rather than on dialog open, though. Gated on the
  // dialog, every one of these started from cold the moment the dialog appeared, so
  // the faculty and subject pickers rendered their "no match" empty states for as
  // long as the round-trips took — which read as "it doesn't show the faculty who
  // specialize in this subject" rather than as loading. Selecting a schedule is
  // already the step before editing it, so fetching there costs nothing extra in
  // practice and the pickers are populated by the time they are opened.
  const entryDialogOpen = addEntryOpen || editEntryOpen
  const entryDataEnabled = entryDialogOpen || !!selectedScheduleId
  // Fetch ALL subjects (no semester filter) — the curriculum map handles semester placement
  const { data: subjects = [], isPending: subjectsPending } = useSubjects({ enabled: entryDataEnabled })
  // "schedulable" widens a CAS Dept Chair's pool from their own cluster to the whole
  // CAS college — the same set auto-generation already draws from, so a faculty
  // member the engine can assign is also one the chair can pick by hand.
  const { data: facultyList = [], isPending: facultyPending } = useFaculty(undefined, {
    enabled: entryDataEnabled,
    scope: "schedulable",
    // Instructors allocated to this program for THIS term are part of the pool.
    semesterId: selectedSchedule?.semesterId ?? null,
  })
  const { data: sections = [] } = useSections({ enabled: entryDataEnabled })
  // A picker must never claim "nobody specializes in this" while the pool it would
  // search is still in flight. React Query reports `isPending` until the first
  // successful load, which is exactly the window the empty states must not fire in.
  const facultyPoolLoading = facultyPending
  const subjectPoolLoading = subjectsPending

  // Department-restricted rooms: only rooms in buildings assigned to the
  // schedule's department. Falls back to all rooms if no department is set.
  const scheduleDeptId = selectedSchedule?.departmentId ?? selectedSchedule?.department?.id

  // Is the currently-open schedule this Dept Chair's own CAS schedule, or another
  // college's (Program Chair's) schedule they're only injecting GEC/GEL into?
  const isChairOwnSchedule = !isSuperAdmin || !selectedSchedule || scheduleDeptId === currentUser?.departmentId
  const chairClusterId = (currentUser as any)?.clusterId ?? null
  const chairOwnedGecCodes: string[] = (currentUser as any)?.myOwnedGecCodes ?? EMPTY_STRING_ARRAY
  // ADMIN (Program Chair): the specific Program they head — a department can hold several
  // programs (each with its own Program Chair), so department-level scoping alone would
  // let one chair's Add/Edit Entry dropdowns show another chair's sections/subjects too.
  const adminProgramId: string | null = isAdmin
    ? ((currentUser as any)?.programHead?.programId ?? (currentUser as any)?.programHead?.program?.id ?? null)
    : null

  // Narrows a subject pool to what the current role/chair may actually manage, mirroring
  // checkSubjectEditPermission's server-side ownership rule so the dropdown never offers
  // a pick the API will reject with a 403.
  //   ADMIN (Program Chair): never GEC/GEL/NSTP/PATHFit, in any department — the API
  //     already excludes these except for the isAdminInCAS carve-out in
  //     /api/subjects/route.ts, so this is the client-side backstop for that one case.
  //   SUPER_ADMIN with a cluster: NSTP/PATHFit (any cluster), their own cluster's
  //     GEC/GEL codes, and — only on their OWN CAS schedule — their cluster's own major
  //     subjects. Majors are off-limits entirely while injecting into another college.
  //   SUPER_ADMIN with no cluster assigned (unfilled cluster seat): full-access
  //     fallback, unchanged — matches the server's equivalent fallback.
  const narrowSubjectsByCluster = (pool: any[]) => {
    const isGenEdOrManualCode = (code: string) => {
      const c = (code ?? "").toUpperCase()
      return c.startsWith("GEC") || c.startsWith("GEL") || c.startsWith("NSTP") || c.startsWith("NST") || c.startsWith("PATHFIT")
    }
    if (isGeUnit) return pool.filter((s: any) => geUnitOwnsCode(userRole, s.code))
    if (isAdmin) {
      const ownCodes = pool.filter((s: any) => !isGenEdOrManualCode(s.code))
      return adminProgramId ? ownCodes.filter((s: any) => s.programId === adminProgramId) : ownCodes
    }
    if (!(isSuperAdmin && chairClusterId)) {
      // Dept Chairs (any cluster) no longer manage PATHFit / NSTP — those belong
      // to the coordinator accounts.
      return isSuperAdmin ? pool.filter((s: any) => !geUnitOwnsCode("PATHFIT", s.code) && !geUnitOwnsCode("NSTP", s.code)) : pool
    }
    return pool.filter((s: any) => {
      const code = (s.code ?? "").toUpperCase()
      if (code.startsWith("NSTP") || code.startsWith("NST") || code.startsWith("PATHFIT")) return false
      if (s.programId == null) {
        return chairOwnedGecCodes.some((c) => c.toUpperCase() === code)
      }
      if (!isChairOwnSchedule) return false // injecting into another college: majors are off-limits
      // Server-side ownership (subject-permissions.ts) only ever consults subject.program,
      // never yearLevel.program — mirror that exactly rather than falling back to it.
      return (s.program?.clusterId ?? null) === chairClusterId
    })
  }
  // Sole room source for the Add/Edit Entry dialogs — /api/rooms already returns
  // every room when the department has no building restrictions, so a separate
  // unscoped useRooms() call would just duplicate this same payload.
  // Key starts with "rooms" on purpose: useCreateRoom/useUpdateRoom invalidate
  // ["rooms"], and React Query matches keys by prefix element-for-element — the old
  // "rooms-by-department" key was a different first element, so it was never
  // invalidated and a room added on the Rooms page stayed missing from this dropdown
  // until a hard refresh. staleTime 0 covers the same case for buildings, whose
  // restrictions change which rooms this endpoint returns.
  const { data: departmentRooms = [] } = useQuery({
    queryKey: ["rooms", "by-department", scheduleDeptId],
    queryFn: async () => {
      const url = scheduleDeptId ? `/api/rooms?departmentId=${scheduleDeptId}` : "/api/rooms"
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) return []
      return json.data ?? []
    },
    enabled: entryDialogOpen,
    // Covered by the ["rooms"] invalidation noted above, so a blocking refetch on
    // every dialog open is not needed to stay correct.
    staleTime: 15_000,
    refetchOnMount: true,
  })

  // Fetch availability for the selected faculty (for time slot filtering in Add
  // Entry). staleTime 0 + refetchOnMount so availability just entered on the
  // Faculty Availability page shows up here immediately instead of sitting
  // behind the app-wide 2-minute cache.
  const { data: facultyAvailability = [] } = useQuery({
    queryKey: ["faculty-availability-entry", entryForm.facultyId, selectedSchedule?.semesterId],
    queryFn: async () => {
      if (!entryForm.facultyId || !selectedSchedule?.semesterId) return []
      const res = await fetch(`/api/faculty/availability?facultyId=${entryForm.facultyId}&semesterId=${selectedSchedule.semesterId}`)
      const json = await res.json()
      if (!res.ok) return []
      return json.data ?? []
    },
    enabled: !!entryForm.facultyId && !!selectedSchedule?.semesterId,
    staleTime: 0,
    refetchOnMount: "always",
  })

  // Issue 3c: Filter subjects by selected faculty's department + specializations
  const selectedFacultyForEntry = useMemo(() => facultyList.find((f: any) => f.id === entryForm.facultyId), [facultyList, entryForm.facultyId])
  const selectedSubjectForEntry = useMemo(() => subjects.find((s: any) => s.id === entryForm.subjectId), [subjects, entryForm.subjectId])
  const selectedSectionForEntry = useMemo(() => sections.find((s: any) => s.id === entryForm.sectionId), [sections, entryForm.sectionId])

  // Lab sets already placed for the currently selected subject + section, so the
  // Set picker can mark the taken half and steer the chair to the free one.
  const placedSetsForEntry = useMemo(() => {
    const taken = new Set<string>()
    for (const e of (selectedSchedule?.entries ?? []) as any[]) {
      if ((e.sectionId ?? e.section?.id) !== entryForm.sectionId) continue
      if ((e.subjectId ?? e.subject?.id) !== entryForm.subjectId) continue
      if (e.set) taken.add(e.set)
    }
    return taken
  }, [selectedSchedule?.entries, entryForm.sectionId, entryForm.subjectId])

  // When one half of a lab is already scheduled, default the picker to the other
  // one instead of leaving it on "Select set".
  useEffect(() => {
    if (selectedSubjectForEntry?.type !== "LABORATORY") return
    if (entryForm.set) return
    const free = (["A", "B"] as const).filter((s) => !placedSetsForEntry.has(s))
    if (free.length === 1) setEntryForm((f) => ({ ...f, set: free[0] }))
  }, [selectedSubjectForEntry, placedSetsForEntry, entryForm.set])

  const filteredSubjects = useMemo(() => {
    let pool = subjects

    // 1. If a section is selected, filter subjects by the section's program + year level using curriculum map
    if (entryForm.sectionId && selectedSectionForEntry) {
      const progAbbr = selectedSectionForEntry.yearLevel?.program?.abbreviation
      const yearLevel = selectedSectionForEntry.yearLevel?.level
      const sem = scheduleSemesterType as "FIRST" | "SECOND" | undefined

      if (progAbbr && yearLevel && sem && hasCurriculumMap(progAbbr)) {
        // Get exact subject codes for this program/year/semester from curriculum map
        const codes = getCurriculumCodes(progAbbr, yearLevel, sem)
        const codeSetLower = new Set(codes.map(c => c.toLowerCase()))
        pool = pool.filter((s: any) => codeSetLower.has((s.code ?? "").toLowerCase()))
      } else if (yearLevel) {
        // Fallback (no curriculum map): filter by year level AND the schedule's semester
        // so the other semester's subjects don't leak into the picker (Section 7 / Bug 2).
        pool = pool.filter((s: any) => s.year === yearLevel && (!sem || s.semester === sem))
      }

      // Exclude subjects already fully scheduled for this section in the current
      // schedule (prevents adding GEC01 twice to the same section).
      //
      // A LABORATORY subject is the exception: it needs TWO entries per section
      // — Set A and Set B, different halves of the class. Excluding it as soon
      // as ONE set was placed made the subject vanish from this picker, so Set B
      // could never be added normally (the only way in was to create a two-day
      // pattern and hand-edit one of the rows). A lab is only "fully scheduled"
      // once BOTH sets exist.
      const scheduleEntries: any[] = selectedSchedule?.entries ?? []
      const sectionEntries = scheduleEntries.filter(
        (e: any) => (e.sectionId ?? e.section?.id) === entryForm.sectionId
      )
      // code -> the set letters already placed for it ("" for non-lab entries)
      const placedSetsByCode = new Map<string, Set<string>>()
      for (const e of sectionEntries) {
        const code = (e.subject?.code ?? "").toLowerCase()
        if (!code) continue
        if (!placedSetsByCode.has(code)) placedSetsByCode.set(code, new Set())
        placedSetsByCode.get(code)!.add(e.set ?? "")
      }
      pool = pool.filter((s: any) => {
        const code = (s.code ?? "").toLowerCase()
        const placed = placedSetsByCode.get(code)
        if (!placed) return true // nothing placed yet — always available
        if (s.type === "LABORATORY") {
          // Keep it listed until both halves are on the schedule.
          return !(placed.has("A") && placed.has("B"))
        }
        return false // non-lab: one entry is the whole subject
      })
    } else if (scheduleSemesterType) {
      // 2. No section selected yet — use curriculum map to get ALL codes for this semester,
      //    scoped to the active schedule's own college/department (not every program university-wide)
      const semCodesLower = new Set<string>()
      const programAbbrs = sections
        .filter((s: any) => !scheduleDeptId || s.yearLevel?.program?.departmentId === scheduleDeptId)
        .map((s: any) => s.yearLevel?.program?.abbreviation)
        .filter((a: string | undefined) => a && hasCurriculumMap(a))
      const uniquePrograms = [...new Set(programAbbrs)] as string[]
      for (const progAbbr of uniquePrograms) {
        for (let yr = 1; yr <= 4; yr++) {
          getCurriculumCodes(progAbbr, yr, scheduleSemesterType as "FIRST" | "SECOND")
            .forEach(c => semCodesLower.add(c.toLowerCase()))
        }
      }
      if (semCodesLower.size > 0) {
        pool = pool.filter((s: any) => semCodesLower.has((s.code ?? "").toLowerCase()))
      }
    }

    // 3. CAS cluster ownership — Dept Chairs only manage their own cluster's territory
    pool = narrowSubjectsByCluster(pool)

    // 4. Faculty specialization filtering — same matcher as the faculty dropdown,
    //    so the two directions always agree on who is qualified for what.
    if (entryForm.facultyId && selectedFacultyForEntry) {
      const matched = pool.filter((s: any) => facultyMatchesSubject(selectedFacultyForEntry, s))
      if (matched.length > 0) return matched
    }

    // Always include the pre-selected subject (set via "Manually Assign") even if
    // curriculum-map filtering would exclude it (e.g. wrong year slot or cross-program subject).
    if (entryForm.subjectId && !pool.some((s: any) => s.id === entryForm.subjectId)) {
      const forced = subjects.find((s: any) => s.id === entryForm.subjectId)
      if (forced) pool = [forced, ...pool]
    }

    return pool
  }, [subjects, entryForm.facultyId, entryForm.sectionId, entryForm.subjectId, selectedFacultyForEntry, selectedSectionForEntry, scheduleSemesterType, sections, selectedSchedule, scheduleDeptId, isSuperAdmin, chairClusterId, chairOwnedGecCodes, isChairOwnSchedule, isAdmin, adminProgramId])

  // Bidirectional: when subject is selected, show only faculty whose specializations match
  // Always exclude inactive faculty
  const filteredFaculty = useMemo(() => {
    const activeFaculty = facultyList.filter((f: any) => f.isActive !== false && f.user?.isActive !== false)

    // Scope to the subject's department so each user sees relevant faculty:
    // SUPER_ADMIN selecting a GEC subject sees CAS faculty; ADMIN selecting ITE sees CIT faculty.
    // Falls back to all active faculty if the subject's dept has no matching faculty records.
    const subjectDeptId = selectedSubjectForEntry?.departmentId
    const deptScoped = subjectDeptId
      ? activeFaculty.filter((f: any) => f.departmentId === subjectDeptId)
      : activeFaculty
    const pool = deptScoped.length > 0 ? deptScoped : activeFaculty

    if (!entryForm.subjectId || !selectedSubjectForEntry) return pool
    // Prefer faculty who specialize in the selected subject. Department scoping is
    // relaxed first — a GEC subject is often taught by faculty recorded under a
    // different department than the subject itself.
    const scoped = pool.filter((f: any) => facultyMatchesSubject(f, selectedSubjectForEntry))
    if (scoped.length > 0) return scoped
    // Falling back to "everyone" here would be a trap: entry-validation rejects an
    // unmatched specialization outright, so any extra name offered is one the save
    // would refuse. The picker shows exactly who the server would accept, and the
    // empty state below explains how to fix the data.
    return activeFaculty.filter((f: any) => facultyMatchesSubject(f, selectedSubjectForEntry))
  }, [facultyList, entryForm.subjectId, selectedSubjectForEntry])

  // Room access check shared by Add/Edit Entry: a room restricted to
  // departments/programs may only host sections whose department OR program
  // (course) is on its list. Unrestricted rooms are open to everyone.
  function roomOpenToSection(room: any, section: any): boolean {
    const depts = room?.departments ?? []
    const progs = room?.programs ?? []
    if (depts.length === 0 && progs.length === 0) return true
    const secProgramId = section?.yearLevel?.programId ?? section?.yearLevel?.program?.id
    const secDeptId = section?.yearLevel?.program?.departmentId
    return (
      depts.some((d: any) => d.departmentId === secDeptId) ||
      progs.some((p: any) => (p.programId ?? p.program?.id) === secProgramId)
    )
  }

  // The placeholder rooms ("TBA" — manual resolution of an Unassigned Queue
  // item; "GYM" — where PATHFIT is held) are always valid picks, but the
  // subject-type filter below would otherwise exclude them whenever their own
  // room type doesn't happen to match. Always keep them in a filtered room
  // list, appended from the unfiltered pool if the filter dropped them.
  function ensureTbaRoom(filtered: any[], pool: any[]): any[] {
    const missing = pool.filter(
      (r: any) => isPlaceholderRoomCode(r.code) && !filtered.some((f: any) => f.id === r.id)
    )
    return missing.length > 0 ? [...filtered, ...missing] : filtered
  }

  // Rooms a subject may use — the same rule the engine and the server
  // validator apply (lib/room-type-rules.ts): explicit Subject.requiredRoomType,
  // else labs → lab rooms (computer-based labs → Computer Laboratory only),
  // lectures → lecture rooms. Kept strict (no "fall back to every room") so the
  // picker never offers a room the save would then reject.
  function roomsForSubject(pool: any[], subject: any): any[] {
    if (!subject) return ensureTbaRoom(pool, pool)
    if (isPathfitCode(subject.code)) {
      // PATHFIT is held in the GYM; keep the lecture rooms available as a fallback.
      const gym = pool.filter((r: any) => r.code === GYM_ROOM_CODE)
      const rest = pool.filter((r: any) => r.code !== GYM_ROOM_CODE && roomTypeAllowedForSubject(r.type, subject))
      return ensureTbaRoom([...gym, ...rest], pool)
    }
    const matching = pool.filter((r: any) => !isPlaceholderRoomCode(r.code) && roomTypeAllowedForSubject(r.type, subject))
    return ensureTbaRoom(matching, pool)
  }

  // Filter rooms by subject type AND department-building restriction.
  // Uses departmentRooms (already filtered to the dept's buildings) as the source pool.
  const filteredRooms = useMemo(() => {
    let pool = departmentRooms as any[]
    // Program (course) room access — narrow to rooms the selected section may use
    if (entryForm.sectionId && selectedSectionForEntry) {
      pool = pool.filter((r: any) => roomOpenToSection(r, selectedSectionForEntry))
    }
    if (!entryForm.subjectId || !selectedSubjectForEntry) return pool
    return roomsForSubject(pool, selectedSubjectForEntry)
  }, [departmentRooms, entryForm.subjectId, entryForm.sectionId, selectedSubjectForEntry, selectedSectionForEntry])

  // Issue 9: Filter time options based on faculty availability for selected day
  const availableTimeOptions = useMemo(() => {
    if (!entryForm.facultyId || !entryForm.day || facultyAvailability.length === 0) return TIME_OPTIONS
    const daySlots = facultyAvailability.filter((a: any) => a.day === entryForm.day)
    if (daySlots.length === 0) return TIME_OPTIONS // no availability data = show all
    return TIME_OPTIONS.filter((t) => {
      const tMins = parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1])
      return daySlots.some((slot: any) => {
        const startMins = parseInt(slot.startTime.split(":")[0]) * 60 + parseInt(slot.startTime.split(":")[1])
        const endMins = parseInt(slot.endTime.split(":")[0]) * 60 + parseInt(slot.endTime.split(":")[1])
        return tMins >= startMins && tMins < endMins
      })
    })
  }, [entryForm.facultyId, entryForm.day, facultyAvailability])

  // Same faculty-availability time filter as availableTimeOptions above, but
  // callable per day — needed because the split-lab-sets Set A/Set B pickers each
  // have their own Day and must filter times against THAT day, not entryForm.day.
  const timeOptionsForDay = useCallback((day: string) => {
    if (!entryForm.facultyId || !day || facultyAvailability.length === 0) return TIME_OPTIONS
    const daySlots = facultyAvailability.filter((a: any) => a.day === day)
    if (daySlots.length === 0) return TIME_OPTIONS
    return TIME_OPTIONS.filter((t) => {
      const tMins = parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1])
      return daySlots.some((slot: any) => {
        const startMins = parseInt(slot.startTime.split(":")[0]) * 60 + parseInt(slot.startTime.split(":")[1])
        const endMins = parseInt(slot.endTime.split(":")[0]) * 60 + parseInt(slot.endTime.split(":")[1])
        return tMins >= startMins && tMins < endMins
      })
    })
  }, [entryForm.facultyId, facultyAvailability])

  // Filter sections by subject year level, department alignment + search text
  // ADMIN (Program Chair): restrict sections to their own department
  const adminDeptId = isAdmin ? (currentUser?.departmentId ?? currentUser?.programHead?.program?.department?.id ?? null) : null

  const filteredSections = useMemo(() => {
    let result = sections as any[]

    // Only show sections belonging to the active schedule's own college/department —
    // applies uniformly to ADMIN (Program Chair, always their own dept anyway) and
    // SUPER_ADMIN (Dept Chair), who previously saw every section university-wide
    // regardless of which schedule they had open.
    if (scheduleDeptId) {
      result = result.filter((s: any) => s.yearLevel?.program?.departmentId === scheduleDeptId)
    }

    // ADMIN (Program Chair): further restrict to sections under their own assigned
    // program — a department can hold several programs, each with its own chair.
    if (isAdmin && adminProgramId) {
      result = result.filter((s: any) => (s.yearLevel?.programId ?? s.yearLevel?.program?.id) === adminProgramId)
    }

    if (entryForm.subjectId && selectedSubjectForEntry) {
      const subjectCode = selectedSubjectForEntry.code ?? ""
      const isShared = subjectCode.startsWith("GEC") || subjectCode.startsWith("GEL") ||
        subjectCode.startsWith("PATHFIT") || subjectCode.startsWith("PATHFit") ||
        subjectCode.startsWith("NST") || subjectCode.startsWith("NSTP")

      if (!isShared) {
        // Major subject — use curriculum map to find which programs have this subject
        const sem = scheduleSemesterType as "FIRST" | "SECOND" | undefined
        if (sem) {
          const matchingPrograms = new Set<string>()
          const matchingYears = new Map<string, number[]>()
          for (const sec of result) {
            const progAbbr = sec.yearLevel?.program?.abbreviation
            const yl = sec.yearLevel?.level
            if (!progAbbr || !yl || !hasCurriculumMap(progAbbr)) continue
            const codes = getCurriculumCodes(progAbbr, yl, sem)
            if (codes.some(c => c.toLowerCase() === subjectCode.toLowerCase())) {
              matchingPrograms.add(progAbbr)
              if (!matchingYears.has(progAbbr)) matchingYears.set(progAbbr, [])
              matchingYears.get(progAbbr)!.push(yl)
            }
          }
          if (matchingPrograms.size > 0) {
            result = result.filter((s: any) => {
              const progAbbr = s.yearLevel?.program?.abbreviation
              const yl = s.yearLevel?.level
              return progAbbr && matchingYears.get(progAbbr)?.includes(yl)
            })
          }
        }
      }
      // For shared subjects (GEC/PATHFit/NST): show all sections (any program can use them)
    }

    // Filter by search text
    if (sectionSearch.trim()) {
      const q = sectionSearch.toLowerCase().trim()
      result = result.filter((s: any) => s.name.toLowerCase().includes(q))
    }
    return result
  }, [sections, entryForm.subjectId, selectedSubjectForEntry, sectionSearch, scheduleDeptId, scheduleSemesterType, isAdmin, adminProgramId])

  // Sections an NSTP class can be merged with: the schedule's department, minus
  // the primary section and any section that already has this subject.
  // Same-year sections of the same program come first (the usual merge).
  const mergeCandidateSections = useMemo(() => {
    if (!entryForm.sectionId || !selectedSubjectForEntry || !isNstpCode(selectedSubjectForEntry.code)) return []
    const code = (selectedSubjectForEntry.code ?? "").toLowerCase()
    const already = new Set(
      (selectedSchedule?.entries ?? [])
        .filter((e: any) => (e.subject?.code ?? "").toLowerCase() === code)
        .map((e: any) => e.sectionId ?? e.section?.id)
    )
    const primary = selectedSectionForEntry
    const pool = (sections as any[]).filter((s: any) =>
      s.id !== entryForm.sectionId &&
      !already.has(s.id) &&
      (!scheduleDeptId || s.yearLevel?.program?.departmentId === scheduleDeptId)
    )
    const rank = (s: any) => {
      const sameProgram = (s.yearLevel?.programId ?? s.yearLevel?.program?.id) === (primary?.yearLevel?.programId ?? primary?.yearLevel?.program?.id)
      const sameYear = s.yearLevel?.level === primary?.yearLevel?.level
      return (sameProgram && sameYear ? 0 : sameYear ? 1 : sameProgram ? 2 : 3)
    }
    return pool.sort((a: any, b: any) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }, [entryForm.sectionId, selectedSubjectForEntry, selectedSectionForEntry, sections, selectedSchedule?.entries, scheduleDeptId])

  // Filter days by faculty availability — only show days where faculty has availability set.
  // Saturday is excluded unless the subject is NSTP or the section belongs to CAM.
  const availableDays = useMemo(() => {
    const saturdayOk =
      subjectAllowsSaturday(selectedSubjectForEntry) || sectionAllowsSaturday(selectedSectionForEntry)
    const basePool = saturdayOk ? DAYS : DAYS.filter((d) => d !== "SATURDAY")
    if (!entryForm.facultyId || facultyAvailability.length === 0) return basePool
    const daysWithAvail = [...new Set(facultyAvailability.map((a: any) => a.day))]
    const filtered = basePool.filter((d) => daysWithAvail.includes(d))
    return filtered.length > 0 ? filtered : basePool
  }, [entryForm.facultyId, facultyAvailability, selectedSubjectForEntry, selectedSectionForEntry])

  // The actual day(s) the Add Entry submission will use, driven by dayPattern.
  // MWF/TTh are literal (Monday+Wednesday+Friday / Tuesday+Thursday) — not
  // filtered down by availableDays here, so if the faculty can't take one of
  // those days the server's per-day validation names exactly which day failed,
  // rather than silently dropping it from the pattern.
  const patternDays = useMemo(() => {
    if (dayPattern === "MWF") return ["MONDAY", "WEDNESDAY", "FRIDAY"]
    if (dayPattern === "TTH") return ["TUESDAY", "THURSDAY"]
    if (dayPattern === "custom") return customDays
    return entryForm.day ? [entryForm.day] : []
  }, [dayPattern, customDays, entryForm.day])

  // For MWF/TTh/custom, keep entryForm.day mirroring the pattern's first day —
  // that's what drives the existing occupied-slot highlighting and time-option
  // filtering below, so those hints still work (for at least the first day) on
  // multi-day patterns instead of going blank. "single" mode is untouched: the
  // day <select> writes entryForm.day directly, so this effect is a no-op there.
  useEffect(() => {
    if (dayPattern === "single") return
    const first = patternDays[0] ?? ""
    if (first !== entryForm.day) setEntryForm((f) => ({ ...f, day: first }))
  }, [dayPattern, patternDays, entryForm.day])

  // Conflict override dialog state (soft-validation) — shared by Add Entry and
  // Edit Entry. pendingForceCreate is set for a new entry (e.g. a specialization
  // mismatch — allowed manually with this warning, never on auto-generation);
  // pendingForceChanges + forceEntryId are set for editing an existing one.
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [pendingForceChanges, setPendingForceChanges] = useState<Record<string, unknown> | null>(null)
  const [forceEntryId, setForceEntryId] = useState<string | null>(null)
  const [pendingForceCreate, setPendingForceCreate] = useState<Record<string, unknown> | null>(null)

  function isOverridableConflict(message: string | null | undefined): boolean {
    const m = (message ?? "").toLowerCase()
    return (
      m.includes("conflict") ||
      m.includes("already assigned") ||
      m.includes("double-booked") ||
      m.includes("not available") ||
      m.includes("specialization mismatch")
    )
  }

  // Edit entry state
  const [editEntryId, setEditEntryId] = useState<string | null>(null)
  const [editEntryForm, setEditEntryForm] = useState({
    subjectId: "",
    facultyId: "",
    roomId: "",
    sectionId: "",
    day: "",
    startTime: "",
    endTime: "",
    set: "" as "" | "A" | "B",
  })
  const [editSectionSearch, setEditSectionSearch] = useState("")
  const [editSectionDropdownOpen, setEditSectionDropdownOpen] = useState(false)
  const editSectionComboRef = useRef<HTMLDivElement>(null)

  // Close edit section dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (editSectionComboRef.current && !editSectionComboRef.current.contains(e.target as Node)) {
        setEditSectionDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Fetch availability for edit form faculty
  const { data: editFacultyAvailability = [] } = useQuery({
    queryKey: ["faculty-availability-edit", editEntryForm.facultyId, selectedSchedule?.semesterId],
    queryFn: async () => {
      if (!editEntryForm.facultyId || !selectedSchedule?.semesterId) return []
      const res = await fetch(`/api/faculty/availability?facultyId=${editEntryForm.facultyId}&semesterId=${selectedSchedule.semesterId}`)
      const json = await res.json()
      if (!res.ok) return []
      return json.data ?? []
    },
    enabled: !!editEntryForm.facultyId && !!selectedSchedule?.semesterId,
  })

  // Edit: selected faculty, subject & section lookups
  const editSelectedFaculty = useMemo(() => facultyList.find((f: any) => f.id === editEntryForm.facultyId), [facultyList, editEntryForm.facultyId])
  const editSelectedSubject = useMemo(() => subjects.find((s: any) => s.id === editEntryForm.subjectId), [subjects, editEntryForm.subjectId])
  const editSelectedSection = useMemo(() => sections.find((s: any) => s.id === editEntryForm.sectionId), [sections, editEntryForm.sectionId])

  // Edit: filter subjects by selected faculty's specializations
  const editFilteredSubjects = useMemo(() => {
    let pool = subjects

    // 1. If a section is selected, filter subjects by the section's program + year level
    //    using the curriculum map (same logic Add Entry uses) — previously missing here,
    //    which let any semester's/program's subject appear regardless of the section picked.
    if (editEntryForm.sectionId && editSelectedSection) {
      const progAbbr = editSelectedSection.yearLevel?.program?.abbreviation
      const yearLevel = editSelectedSection.yearLevel?.level
      const sem = scheduleSemesterType as "FIRST" | "SECOND" | undefined

      if (progAbbr && yearLevel && sem && hasCurriculumMap(progAbbr)) {
        const codes = getCurriculumCodes(progAbbr, yearLevel, sem)
        const codeSetLower = new Set(codes.map(c => c.toLowerCase()))
        pool = pool.filter((s: any) => codeSetLower.has((s.code ?? "").toLowerCase()))
      } else if (yearLevel) {
        // Fallback (no curriculum map): year level AND the schedule's semester
        // so the other semester's subjects don't leak in (Section 7 / Bug 2).
        pool = pool.filter((s: any) => s.year === yearLevel && (!sem || s.semester === sem))
      }
    } else if (scheduleSemesterType) {
      // No section selected yet — restrict to this semester's codes, scoped to the
      // active schedule's own college/department.
      const semCodesLower = new Set<string>()
      const programAbbrs = sections
        .filter((s: any) => !scheduleDeptId || s.yearLevel?.program?.departmentId === scheduleDeptId)
        .map((s: any) => s.yearLevel?.program?.abbreviation)
        .filter((a: string | undefined) => a && hasCurriculumMap(a))
      const uniquePrograms = [...new Set(programAbbrs)] as string[]
      for (const progAbbr of uniquePrograms) {
        for (let yr = 1; yr <= 4; yr++) {
          getCurriculumCodes(progAbbr, yr, scheduleSemesterType as "FIRST" | "SECOND")
            .forEach(c => semCodesLower.add(c.toLowerCase()))
        }
      }
      if (semCodesLower.size > 0) {
        pool = pool.filter((s: any) => semCodesLower.has((s.code ?? "").toLowerCase()))
      }
    }

    // 2. CAS cluster ownership — Dept Chairs only manage their own cluster's territory
    pool = narrowSubjectsByCluster(pool)

    // 3. Exclude subjects already fully-scheduled for this section, except:
    // - the entry currently being edited (always keep its subject in the pool)
    // - lab subjects with A/B sets: editing Set-A should not block the same subject
    //   just because Set-B is also scheduled for the section
    if (editEntryForm.sectionId) {
      const scheduleEntries: any[] = selectedSchedule?.entries ?? []
      const currentEntry = scheduleEntries.find((e: any) => e.id === editEntryId)
      const currentSet = currentEntry?.set ?? editEntryForm.set ?? null

      const alreadyScheduledCodes = new Set(
        scheduleEntries
          .filter((e: any) => {
            if ((e.sectionId ?? e.section?.id) !== editEntryForm.sectionId) return false
            if (e.id === editEntryId) return false
            // Same subject with the same set as the entry being edited → sibling set entry;
            // don't let it block the subject from appearing in the dropdown.
            const sameSubjectCode = (e.subject?.code ?? "").toLowerCase() ===
              (currentEntry?.subject?.code ?? "").toLowerCase()
            if (sameSubjectCode && currentSet && e.set && e.set !== currentSet) return false
            return true
          })
          .map((e: any) => (e.subject?.code ?? "").toLowerCase())
          .filter(Boolean)
      )
      if (alreadyScheduledCodes.size > 0) {
        pool = pool.filter((s: any) => !alreadyScheduledCodes.has((s.code ?? "").toLowerCase()))
      }
    }

    // 4. Faculty specialization filtering — shared matcher (see Add Entry).
    if (editEntryForm.facultyId && editSelectedFaculty) {
      const matched = pool.filter((s: any) => facultyMatchesSubject(editSelectedFaculty, s))
      if (matched.length > 0) pool = matched
    }

    // Always keep the entry's current subject in the pool even if the filtering above
    // would otherwise exclude it (e.g. wrong year slot or cross-cluster subject already
    // on the schedule from before this constraint existed).
    if (editEntryForm.subjectId && !pool.some((s: any) => s.id === editEntryForm.subjectId)) {
      const forced = subjects.find((s: any) => s.id === editEntryForm.subjectId)
      if (forced) pool = [forced, ...pool]
    }

    return pool
  }, [subjects, editEntryForm.facultyId, editEntryForm.sectionId, editEntryForm.subjectId, editEntryForm.set, editSelectedFaculty, editSelectedSection, selectedSchedule, editEntryId, scheduleSemesterType, sections, scheduleDeptId, isSuperAdmin, chairClusterId, chairOwnedGecCodes, isChairOwnSchedule, isAdmin, adminProgramId])

  // Edit: filter faculty by selected subject
  const editFilteredFaculty = useMemo(() => {
    const activeFaculty = facultyList.filter((f: any) => f.isActive !== false && f.user?.isActive !== false)
    // Always keep whoever is currently on the entry selectable, even when they fail
    // the specialization filter below. Without this the assigned faculty dropped out
    // of the list, the <select> had no option matching its value, and the whole
    // dialog rendered as if nothing was set.
    const keepCurrent = (pool: any[]) => {
      const id = editEntryForm.facultyId
      if (!id || pool.some((f: any) => f.id === id)) return pool
      const forced = facultyList.find((f: any) => f.id === id)
      return forced ? [forced, ...pool] : pool
    }
    if (!editEntryForm.subjectId || !editSelectedSubject) return keepCurrent(activeFaculty)
    const subjectTitle = (editSelectedSubject.title ?? "").toLowerCase()
    if (!subjectTitle) return keepCurrent(activeFaculty)
    // Strict: only faculty specializing in the selected subject — same rule as Add Entry.
    // Only who the server would accept (see Add Entry), plus whoever is already on
    // the entry so an existing row never renders with a blank Faculty field.
    return keepCurrent(activeFaculty.filter((f: any) => facultyMatchesSubject(f, editSelectedSubject)))
  }, [facultyList, editEntryForm.subjectId, editEntryForm.facultyId, editSelectedSubject])

  // Edit: filter rooms by subject's required room type, falling back to subject type
  const editFilteredRooms = useMemo(() => {
    // Program (course) room access — narrow to rooms the selected section may use.
    // Uses departmentRooms (schedule-scoped), matching Add Entry's filteredRooms —
    // previously used the unscoped `rooms` list, the one place Edit Entry hadn't
    // gotten the same college/department scoping as Add Entry.
    let pool = departmentRooms as any[]
    if (editEntryForm.sectionId && editSelectedSection) {
      pool = pool.filter((r: any) => roomOpenToSection(r, editSelectedSection))
    }
    if (!editEntryForm.subjectId || !editSelectedSubject) return pool
    // Same room-type rule as Add Entry (lib/room-type-rules.ts).
    return roomsForSubject(pool, editSelectedSubject)
  }, [departmentRooms, editEntryForm.subjectId, editEntryForm.sectionId, editSelectedSubject, editSelectedSection])

  // The entry's own room must stay in the list even if the filters above would drop
  // it (a room whose access rules changed after the entry was created, say) —
  // otherwise the Room select renders blank on a perfectly valid entry.
  const editRoomOptions = useMemo(() => {
    const id = editEntryForm.roomId
    if (!id || editFilteredRooms.some((r: any) => r.id === id)) return editFilteredRooms
    const forced = (departmentRooms as any[]).find((r: any) => r.id === id)
    return forced ? [forced, ...editFilteredRooms] : editFilteredRooms
  }, [editFilteredRooms, editEntryForm.roomId, departmentRooms])

  // Edit: filter sections by subject alignment (year level + department)
  const editFilteredSections = useMemo(() => {
    let result = sections as any[]

    // Only show sections belonging to the active schedule's own college/department —
    // same uniform rule as Add Entry's filteredSections.
    if (scheduleDeptId) {
      result = result.filter((s: any) => s.yearLevel?.program?.departmentId === scheduleDeptId)
    }

    // ADMIN (Program Chair): further restrict to sections under their own assigned
    // program — same rule as Add Entry's filteredSections.
    if (isAdmin && adminProgramId) {
      result = result.filter((s: any) => (s.yearLevel?.programId ?? s.yearLevel?.program?.id) === adminProgramId)
    }

    if (editEntryForm.subjectId && editSelectedSubject) {
      const subjectYear = editSelectedSubject.year ?? editSelectedSubject.yearLevel?.level
      const subjectDeptId = editSelectedSubject.departmentId ?? editSelectedSubject.department?.id
      const subjectYearLevelId = editSelectedSubject.yearLevelId

      if (subjectYearLevelId) {
        const ylFiltered = result.filter((s: any) => s.yearLevelId === subjectYearLevelId)
        if (ylFiltered.length > 0) result = ylFiltered
      } else {
        // Non-GEC/PATHFIT subjects can only be assigned to sections in the same department
        const subjectCode = editSelectedSubject.code ?? ""
        const isGEC = subjectCode.startsWith("GEC") || subjectCode.startsWith("PATHFIT")

        if (subjectDeptId && !isGEC) {
          const deptFiltered = result.filter((s: any) => s.yearLevel?.program?.departmentId === subjectDeptId)
          if (deptFiltered.length > 0) result = deptFiltered
        }
        if (subjectYear) {
          const yearFiltered = result.filter((s: any) => (s.yearLevel?.level ?? 0) === subjectYear)
          if (yearFiltered.length > 0) result = yearFiltered
        }
      }
    }
    if (editSectionSearch.trim()) {
      const q = editSectionSearch.toLowerCase().trim()
      result = result.filter((s: any) => s.name.toLowerCase().includes(q))
    }
    return result
  }, [sections, editEntryForm.subjectId, editSelectedSubject, editSectionSearch, scheduleDeptId, isAdmin, adminProgramId])

  // Same guarantee for the section combobox: whatever the entry already points at
  // stays resolvable, so the field shows its real value rather than empty.
  const editSectionOptions = useMemo(() => {
    const id = editEntryForm.sectionId
    if (!id || editSectionSearch.trim() || editFilteredSections.some((s: any) => s.id === id)) return editFilteredSections
    const forced = (sections as any[]).find((s: any) => s.id === id)
    return forced ? [forced, ...editFilteredSections] : editFilteredSections
  }, [editFilteredSections, editEntryForm.sectionId, editSectionSearch, sections])

  // Edit: filter days by faculty availability + Saturday restriction (CAM/NSTP only)
  const editAvailableDays = useMemo(() => {
    const saturdayOk =
      subjectAllowsSaturday(editSelectedSubject) || sectionAllowsSaturday(editSelectedSection)
    const basePool = saturdayOk ? DAYS : DAYS.filter((d) => d !== "SATURDAY")
    if (!editEntryForm.facultyId || editFacultyAvailability.length === 0) return basePool
    const daysWithAvail = [...new Set(editFacultyAvailability.map((a: any) => a.day))]
    const filtered = basePool.filter((d) => daysWithAvail.includes(d))
    return filtered.length > 0 ? filtered : basePool
  }, [editEntryForm.facultyId, editFacultyAvailability, editSelectedSubject, editSelectedSection])

  // Edit: filter time options by faculty availability for selected day
  const editAvailableTimeOptions = useMemo(() => {
    if (!editEntryForm.facultyId || !editEntryForm.day || editFacultyAvailability.length === 0) return TIME_OPTIONS
    const daySlots = editFacultyAvailability.filter((a: any) => a.day === editEntryForm.day)
    if (daySlots.length === 0) return TIME_OPTIONS
    return TIME_OPTIONS.filter((t) => {
      const tMins = parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1])
      return daySlots.some((slot: any) => {
        const startMins = parseInt(slot.startTime.split(":")[0]) * 60 + parseInt(slot.startTime.split(":")[1])
        const endMins = parseInt(slot.endTime.split(":")[0]) * 60 + parseInt(slot.endTime.split(":")[1])
        return tMins >= startMins && tMins < endMins
      })
    })
  }, [editEntryForm.facultyId, editEntryForm.day, editFacultyAvailability])

  // Entry filters (shared across list + calendar views)
  const [calFilterFaculty, setCalFilterFaculty] = useState("")
  const [calFilterSection, setCalFilterSection] = useState("")
  const [calFilterRoom, setCalFilterRoom] = useState("")
  // Per-day navigation: "ALL" (whole week) or one weekday, in every view.
  const [selectedDay, setSelectedDay] = useState<string>("ALL")
  const showAllDays = selectedDay === "ALL"
  const [entrySearch, setEntrySearch] = useState("")
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null)

  const createSchedule = useCreateSchedule()
  // Full department list for the New Schedule picker — derived from the
  // departments table, not from existing schedules, because the whole point is
  // creating one for a department that has no schedule yet.
  const { data: allDepartments = [] } = useDepartments()
  const generateSchedule = useGenerateSchedule()
  const updateTerm = useUpdateScheduleTerm()
  const createEntry = useCreateEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()
  const deleteSchedule = useDeleteSchedule()
  const publishSchedule = usePublishSchedule()
  const unpublishSchedule = useUnpublishSchedule()
  const archiveSchedule = useArchiveSchedule()

  const isLoading = tab === "active" ? loadingActive : loadingArchived

  // Build unique department options from every schedule we received (both tabs)
  // so the filter dropdown is stable and doesn't jump when switching tabs.
  const deptOptions = useMemo(() => {
    const map = new Map<string, string>()
    const allSchedules = [...activeSchedules as any[], ...archivedSchedules as any[]]
    const visible = isAdmin && adminDeptId
      ? allSchedules.filter((s: any) => (s.departmentId ?? s.department?.id) === adminDeptId)
      : allSchedules
    visible.forEach((s: any) => {
      if (s.department?.id)
        map.set(s.department.id, s.department.abbreviation ?? s.department.name ?? "")
    })
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    )
  }, [activeSchedules, archivedSchedules, isAdmin, adminDeptId])

  // Apply dept filter on top of the active/archived tab selection.
  // ADMIN (Program Chair): only show their own department's schedules.
  const visibleActiveCount = useMemo(() => {
    if (!isAdmin || !adminDeptId) return (activeSchedules as any[]).length
    return (activeSchedules as any[]).filter((s: any) => (s.departmentId ?? s.department?.id) === adminDeptId).length
  }, [activeSchedules, isAdmin, adminDeptId])

  const visibleArchivedCount = useMemo(() => {
    if (!isAdmin || !adminDeptId) return (archivedSchedules as any[]).length
    return (archivedSchedules as any[]).filter((s: any) => (s.departmentId ?? s.department?.id) === adminDeptId).length
  }, [archivedSchedules, isAdmin, adminDeptId])

  const schedules = useMemo(() => {
    let base = tab === "active" ? activeSchedules as any[] : archivedSchedules as any[]
    if (isAdmin && adminDeptId) {
      base = base.filter((s: any) => (s.departmentId ?? s.department?.id) === adminDeptId)
    }
    if (semFilter) {
      base = base.filter((s: any) => s.semester?.type === semFilter)
    }
    if (!deptFilter) return base
    return base.filter((s: any) => s.department?.id === deptFilter)
  }, [tab, activeSchedules, archivedSchedules, deptFilter, semFilter, isAdmin, adminDeptId])
  // Schedule list — 10 cards per page.
  const schedulesPager = usePagination(schedules)

  const entries: any[] = selectedSchedule?.entries ?? []

  // ── Constraint-based occupied slot detection ──
  // Check which time slots are occupied by existing entries for selected faculty/room/section on the selected day
  const toMinsHelper = (t: string) => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1])

  const occupiedSlots = useMemo(() => {
    if (!entryForm.day) return { faculty: [] as string[], room: [] as string[], section: [] as string[] }
    const sameDayEntries = entries.filter((e: any) => e.day === entryForm.day)

    const getOccupiedTimes = (filteredEntries: any[]) => {
      const occupied: string[] = []
      for (const e of filteredEntries) {
        const s = toMinsHelper(e.startTime)
        const end = toMinsHelper(e.endTime)
        for (const t of TIME_OPTIONS) {
          const tMins = toMinsHelper(t)
          if (tMins >= s && tMins < end) occupied.push(t)
        }
      }
      return occupied
    }

    return {
      faculty: entryForm.facultyId ? getOccupiedTimes(sameDayEntries.filter((e: any) => (e.facultyId || e.faculty?.id) === entryForm.facultyId)) : [],
      room: entryForm.roomId ? getOccupiedTimes(sameDayEntries.filter((e: any) => (e.roomId || e.room?.id) === entryForm.roomId)) : [],
      section: entryForm.sectionId ? getOccupiedTimes(sameDayEntries.filter((e: any) => (e.sectionId || e.section?.id) === entryForm.sectionId)) : [],
    }
  }, [entries, entryForm.day, entryForm.facultyId, entryForm.roomId, entryForm.sectionId])

  // Merge all occupied slots to show constraint-aware start times
  const constraintFilteredStartTimes = useMemo(() => {
    const allOccupied = new Set([...occupiedSlots.faculty, ...occupiedSlots.room, ...occupiedSlots.section])
    return availableTimeOptions.map((t) => ({
      time: t,
      available: !allOccupied.has(t),
      reasons: [
        ...(occupiedSlots.faculty.includes(t) ? ["Faculty busy"] : []),
        ...(occupiedSlots.room.includes(t) ? ["Room taken"] : []),
        ...(occupiedSlots.section.includes(t) ? ["Section busy"] : []),
      ],
    }))
  }, [availableTimeOptions, occupiedSlots])

  // For end time: additionally block slots that would overlap with the next occupied block after startTime
  const constraintFilteredEndTimes = useMemo(() => {
    if (!entryForm.startTime) return []
    const startMins = toMinsHelper(entryForm.startTime)
    const allOccupied = new Set([...occupiedSlots.faculty, ...occupiedSlots.room, ...occupiedSlots.section])

    // Find the first occupied slot after startTime to cap end time
    const nextOccupied = availableTimeOptions
      .filter((t) => toMinsHelper(t) > startMins && allOccupied.has(t))
      .sort((a, b) => toMinsHelper(a) - toMinsHelper(b))[0]
    const nextOccupiedEnd = nextOccupied ? toMinsHelper(nextOccupied) : Infinity
    // Per-day cap (GEC/GEL): the session may not run longer than the subject's limit.
    const cap = selectedSubjectForEntry ? resolveMaxMinutesPerDay(selectedSubjectForEntry) : null
    const maxEnd = Math.min(nextOccupiedEnd, cap !== null ? startMins + cap : Infinity)

    return availableTimeOptions
      .filter((t) => toMinsHelper(t) > startMins && toMinsHelper(t) <= maxEnd)
      .map((t) => ({ time: t, available: true }))
  }, [entryForm.startTime, availableTimeOptions, occupiedSlots, selectedSubjectForEntry])

  const isDraft = selectedSchedule?.status === "DRAFT"
  const isPendingApproval = selectedSchedule?.status === "PENDING_APPROVAL"
  const isPublished = selectedSchedule?.status === "PUBLISHED"
  // ── Permission model ──────────────────────────────────────────────────────
  // Dept Chair (SUPER_ADMIN):
  //   - Plots and finalizes GEC/GEL in every department's schedule (any stage)
  //   - Publishes only their own CAS schedule; unpublish / reset on PUBLISHED
  // Program Chair (ADMIN):
  //   - Owns the DRAFT: adds their majors, marks them done, and — once every
  //     Program Chairperson of the department is done — submits for approval
  //   - After submission, schedule is locked until the Dean acts
  // Dean:
  //   - Approves or returns (with a note) their department's submitted schedule
  //
  // SUPER_ADMIN also has full visibility of all Program Chair schedules to detect
  // room conflicts across colleges.

  // ADMIN can only modify schedules that belong to their own department.
  // Without this, an ADMIN sees the CAS Dept Chair's Published schedule and
  // incorrectly gets "Notify Faculty" / "Add Entry" buttons on it.
  const isOwnSchedule = !isAdmin || !selectedSchedule || (
    (selectedSchedule?.departmentId ?? selectedSchedule?.department?.id) === adminDeptId
  )
  // Dept Chair (SUPER_ADMIN) only owns their own CAS schedule. On another
  // college's Program Chair schedule they may still review/approve/reject it,
  // but individual entry edit/delete is off-limits for major subjects — those
  // belong to that college's own Program Chair. GEC/GEL/NSTP/PATHFit entries
  // (their cluster's territory even when injected into another schedule) stay
  // editable regardless of whose schedule they sit in.
  const isSuperAdminOwnSchedule = !isSuperAdmin || !selectedSchedule || (
    (selectedSchedule?.departmentId ?? selectedSchedule?.department?.id) === currentUser?.departmentId
  )
  // The Dean approves only their own department's schedule (the list is already
  // scoped to it server-side; this keeps the strip honest regardless).
  const isDeanOwnSchedule = !isDean || !selectedSchedule || (
    (selectedSchedule?.departmentId ?? selectedSchedule?.department?.id) === currentUser?.departmentId
  )
  const GENED_OR_MANUAL_CODE_RE = /^(GEC|GEL|NSTP|NST|PATHFIT)/i

  // ── GEC-finalized gate ──────────────────────────────────────────────────
  // Program Chairs may not add/generate/submit majors until ALL THREE CAS
  // cluster chairpersons have explicitly finalized GEC/GEL for this schedule —
  // not merely "some GEC entry exists". Mirrors the server gates in
  // entries/route.ts, generate/route.ts and workflow/route.ts.
  interface GecClusterStatus { id: string; name: string; finalized: boolean; finalizedBy: string | null; finalizedAt: string | null }
  const { data: gecFinalization, refetch: refetchGecFinalization } = useQuery<{ clusters: GecClusterStatus[]; allFinalized: boolean }>({
    queryKey: ["gec-finalization", selectedScheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/${selectedScheduleId}/gec-finalize`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load GEC finalization status")
      return json.data
    },
    enabled: !!selectedScheduleId,
    staleTime: 10_000,
  })
  const gecClusters = gecFinalization?.clusters ?? []
  const gecReady = !!gecFinalization?.allFinalized
  const chairIsCit =
    isAdmin && (currentUser as any)?.programHead?.program?.department?.college?.abbreviation === "CIT"
  const waitingForGec = isAdmin && isOwnSchedule && isDraft && !gecReady

  // The signed-in Dept Chairperson's own cluster row, if they have one.
  const myClusterId: string | null = isSuperAdmin ? ((currentUser as any)?.clusterId ?? null) : null
  const myClusterStatus = myClusterId ? gecClusters.find((c) => c.id === myClusterId) : null

  const gecFinalizeMutation = useMutation({
    mutationFn: async (vars: { action: "finalize" | "unfinalize"; clusterId?: string }) => {
      const res = await fetch(`/api/schedules/${selectedScheduleId}/gec-finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to update finalization status")
      return json.data
    },
    onSuccess: (data, vars) => {
      refetchGecFinalization()
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      toast.success(
        vars.action === "finalize"
          ? data.allFinalized
            ? "Finalized — all three department heads are now done. Program Chairpersons are unlocked."
            : "Your GEC/GEL is finalized for this schedule."
          : "Reopened — your GEC/GEL is editable again."
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // The Dean is read-only: every flag below stays false for them. The PATHFit /
  // NSTP coordinators may place their own classes at any stage (server mirrors
  // this in entries/route.ts); only the PATHFit coordinator has a Generate run —
  // NSTP is never auto-generated.
  const canModifyEntries = isSuperAdmin || isGeUnit || (isAdmin && isOwnSchedule && isDraft)
  // A CIT chair keeps Add Entry during the pre-plot stage (labs only — the
  // server refuses anything else); every other chair waits for GEC.
  const canAddEntry = isSuperAdmin || isGeUnit || (isAdmin && isOwnSchedule && isDraft && (gecReady || chairIsCit))
  // Generate: the Dept Chair any time; the PATHFit coordinator any time (their
  // run places PATHFit only); a Program Chair on their own DRAFT once GEC exists
  // (CIT may run it earlier — it then places labs only).
  const canGenerate =
    (isSuperAdmin) ||
    userRole === "PATHFIT" ||
    (isAdmin && isOwnSchedule && isDraft && (gecReady || chairIsCit))
  // SUPER_ADMIN: publishes only their OWN (CAS) schedule — it has no Program
  //   Chairpersons to submit it. Every other department's schedule is submitted by
  //   its Program Chairpersons and approved by its Dean (WorkflowActions).
  // ADMIN: "Notify Faculty" action on an already-PUBLISHED schedule (does not change status)
  const canPublish =
    (isSuperAdmin && isSuperAdminOwnSchedule && (isDraft || isPendingApproval)) ||
    (isAdmin && isOwnSchedule && isPublished)
  const canUnpublish = isSuperAdmin && isPublished
  // Archive & Delete: the Dept Chair on any schedule; a Program Chair only on a
  // schedule in their OWN department (isOwnSchedule). Enforced server-side too.
  const canArchiveOrDelete = isSuperAdmin || (isAdmin && isOwnSchedule)
  const canDelete = canArchiveOrDelete
  const currentUserId = currentUser?.id ?? ""
  // 1 department per college in this schema (CAS' 3 chairs share one CAS
  // department; CIT has one CIT department, etc.) — the same assumption
  // CAS_DEPT_ID checks elsewhere in this codebase already rely on. Used below
  // to mirror checkSubjectEditPermission's collegeAbbr checks without an extra
  // fetch: the schedule's owning department's abbreviation IS its college's.
  const scheduleCollegeAbbr = selectedSchedule?.department?.abbreviation ?? null
  const MANUAL_PREFIXES_RE = /^(NSTP|NST|PATHFIT|PATHFit)/i

  // Mirrors the server's actual permission rule exactly — role/status window
  // from entries/[entryId]/route.ts PATCH & DELETE, subject ownership from
  // checkSubjectEditPermission() (lib/services/subject-permissions.ts).
  //
  // Previously this used `entry.createdBy === currentUserId` as the primary
  // gate, which only happens to line up with the server's real rule right
  // after the current user personally created the entry — it fails for any
  // entry someone else placed (a Dept Chair correcting a CIT-plotted lab,
  // pre-existing/seeded data, a teammate's entry) even when the server would
  // allow editing it. It also skipped SUPER_ADMIN on DRAFT status entirely,
  // even though POST/PATCH/DELETE all explicitly allow Dept Chairs on DRAFT —
  // so a Dept Chair could ADD an entry to a DRAFT schedule and then see no
  // edit/delete button on it at all.
  const canEditEntry = (entry: any) => {
    // Role + status window (matches the server precisely).
    if (isGeUnit) {
      // any status — but ONLY their own subject family
      return geUnitOwnsCode(userRole, entry.subject?.code)
    }
    if (isSuperAdmin) {
      // any status — subject ownership decides below
    } else if (isAdmin && isOwnSchedule && isDraft) {
      // own DRAFT only — subject ownership decides below
    } else {
      return false
    }

    const code = (entry.subject?.code ?? "").toUpperCase()
    const isLab = entry.subject?.type === "LABORATORY"
    const subjProgramId: string | null = entry.subject?.programId ?? null
    const subjClusterId: string | null = entry.subject?.program?.clusterId ?? null

    // CIT laboratory subjects: exclusive to their own CIT Program Chairperson —
    // checked first, before every other rule, same as the server.
    if (isLab && scheduleCollegeAbbr === "CIT") {
      return isAdmin && subjProgramId != null && subjProgramId === adminProgramId
    }

    // NSTP/PATHFit — the coordinator accounts only (handled above); no chair.
    if (MANUAL_PREFIXES_RE.test(code)) {
      return false
    }

    if (isSuperAdmin) {
      // May view but not edit another college's major subject — except CAS,
      // where the Dept Chair holds delegated Program-Chair-level access.
      if (subjProgramId && scheduleCollegeAbbr && scheduleCollegeAbbr !== "CAS") return false
      if (!chairClusterId) return true // no-cluster chair: full-access fallback
      if (subjProgramId) return subjClusterId === chairClusterId
      return chairOwnedGecCodes.some((c) => c.toUpperCase() === code)
    }

    // isAdmin, already confirmed above: own program's majors + own department's
    // shared non-GEC subjects. Never GEC/GEL (Dept Chair territory).
    if (code.startsWith("GEC") || code.startsWith("GEL")) return false
    if (subjProgramId) return subjProgramId === adminProgramId
    // Dept-wide non-GEC subject (e.g. RES/FLO/OJT) — isOwnSchedule already
    // confirmed this schedule belongs to the chair's own department.
    return true
  }

  // Apply entry filters (shared across list + calendar views)
  // Sections an NSTP class being edited can still merge with: the schedule's
  // department, minus those already in the class and those that already have
  // this subject elsewhere in the schedule.
  const editMergeCandidates = useMemo(() => {
    if (!isNstpCode(editSelectedSubject?.code)) return []
    const code = (editSelectedSubject?.code ?? "").toLowerCase()
    const editing = entries.find((e: any) => e.id === editEntryId)
    const already = new Set(
      entries
        .filter((e: any) => (e.subject?.code ?? "").toLowerCase() === code && !(editing?.mergeGroupId && e.mergeGroupId === editing.mergeGroupId) && e.id !== editEntryId)
        .map((e: any) => e.sectionId ?? e.section?.id)
    )
    return (sections as any[])
      .filter((s: any) =>
        !editMergeSectionIds.includes(s.id) &&
        !already.has(s.id) &&
        (!scheduleDeptId || s.yearLevel?.program?.departmentId === scheduleDeptId)
      )
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
  }, [editSelectedSubject, entries, editEntryId, sections, editMergeSectionIds, scheduleDeptId])

  // A merged NSTP class is stored as one row per (section, day) sharing a
  // mergeGroupId. For display, the rows of one session collapse into a single
  // line carrying every section (`__mergedSections`) and every row id
  // (`__mergedIds`, for conflict highlighting). Raw `entries` stays as-is for
  // the conflict checks and the edit/delete lookups.
  const collapsedEntries = useMemo(() => {
    const out: any[] = []
    const byKey = new Map<string, any>()
    for (const e of entries) {
      if (!e.mergeGroupId) { out.push(e); continue }
      const key = `${e.mergeGroupId}|${e.day}|${e.startTime}|${e.endTime}`
      const sec = { id: e.sectionId ?? e.section?.id, name: e.section?.name ?? "" }
      const existing = byKey.get(key)
      if (existing) {
        existing.__mergedSections.push(sec)
        existing.__mergedIds.push(e.id)
        continue
      }
      const row = { ...e, __mergedSections: [sec], __mergedIds: [e.id] }
      byKey.set(key, row)
      out.push(row)
    }
    for (const row of byKey.values()) {
      row.__mergedSections.sort((a: any, b: any) => a.name.localeCompare(b.name))
    }
    return out
  }, [entries])

  // Section names shown for a (possibly merged) display row.
  const entrySectionLabel = (e: any): string =>
    e.__mergedSections?.length > 1
      ? e.__mergedSections.map((x: any) => x.name).join(" + ")
      : (e.section?.name ?? "")

  const filteredEntries = useMemo(() => {
    let result = collapsedEntries
    if (calFilterFaculty) result = result.filter((e: any) => (e.facultyId === calFilterFaculty || e.faculty?.id === calFilterFaculty))
    if (calFilterSection) result = result.filter((e: any) =>
      e.__mergedSections
        ? e.__mergedSections.some((x: any) => x.id === calFilterSection)
        : (e.sectionId === calFilterSection || e.section?.id === calFilterSection)
    )
    if (calFilterRoom) result = result.filter((e: any) => (e.roomId === calFilterRoom || e.room?.id === calFilterRoom))
    if (entrySearch.trim()) {
      const q = entrySearch.toLowerCase().trim()
      result = result.filter((e: any) => {
        const code = (e.subject?.code ?? "").toLowerCase()
        const title = (e.subject?.title ?? "").toLowerCase()
        const faculty = `${e.faculty?.user?.firstName ?? ""} ${e.faculty?.user?.lastName ?? ""}`.toLowerCase()
        const room = (e.room?.code ?? "").toLowerCase()
        const section = entrySectionLabel(e).toLowerCase()
        return code.includes(q) || title.includes(q) || faculty.includes(q) || room.includes(q) || section.includes(q)
      })
    }
    return result
  }, [collapsedEntries, calFilterFaculty, calFilterSection, calFilterRoom, entrySearch])

  // Unresolved ConflictLog rows for the selected schedule — drives the Calendar's
  // hasConflict highlighting and the Conflicts banner (all types, including
  // LOAD_EXCEEDED warnings, are worth surfacing here).
  const unresolvedConflicts = useMemo(
    () => ((selectedSchedule?.conflicts ?? []) as any[]).filter((c: any) => !c.resolved),
    [selectedSchedule?.conflicts]
  )

  // WorkflowActions' Approve gate mirrors the backend check in
  // /api/schedules/[id]/workflow (action: "approve"), which excludes
  // LOAD_EXCEEDED — a WARNING-severity conflict that's allowed to reach
  // publish. Counting it here would grey out Approve for something the
  // server itself doesn't block on.
  const blockingConflictCount = useMemo(
    () => unresolvedConflicts.filter((c: any) => c.type !== "LOAD_EXCEEDED").length,
    [unresolvedConflicts]
  )

  const calendarEntries = useMemo(() => filteredEntries.map((e: any) => ({
    id: e.id,
    subjectCode: e.subject?.code ?? "",
    subjectTitle: e.subject?.title ?? "",
    // Free-text override first ("TBA" on PATHFIT rows), then the linked record.
    facultyName: e.facultyName || (e.faculty?.user ? `${e.faculty.user.firstName} ${e.faculty.user.lastName}` : ""),
    roomCode: e.room?.code ?? "",
    sectionName: entrySectionLabel(e),
    day: e.day,
    startTime: e.startTime,
    endTime: e.endTime,
    type: (e.subject?.type ?? "LECTURE") as "LECTURE" | "LABORATORY",
    set: e.set ?? null,
    hasConflict: unresolvedConflicts.some((c: any) => (e.__mergedIds ?? [e.id]).some((id: string) => c.entityIds?.includes(id))),
  })), [filteredEntries, unresolvedConflicts])

  // Multi-day (MWF/TTh) auto-generated entries share a groupId. Each session
  // row is annotated with its pattern (size + "Mon/Wed/Fri" label) so the
  // per-day views can show one row per day while still flagging that the
  // class meets on other days too and that edits/deletes move the whole set.
  // Manually-added / single-session entries have groupId: null → group of 1.
  const groupInfo = useMemo(() => {
    const byKey = new Map<string, any[]>()
    for (const e of filteredEntries) {
      const key = e.groupId ?? e.id
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(e)
    }
    const info = new Map<string, { size: number; label: string }>()
    for (const [key, members] of byKey) {
      // Distinct days — a merged class contributes one display row per day
      // already, but guard anyway so the label never reads "Sat/Sat".
      const days = [...new Set(members.map((m) => m.day))].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))
      info.set(key, { size: days.length, label: days.map((d) => DAY_LABELS[d] ?? d).join("/") })
    }
    return info
  }, [filteredEntries])

  // Entries per day for the day-tab counters (after the search/faculty/section/
  // room filters, before the day itself).
  const entriesPerDay = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of filteredEntries) counts[e.day] = (counts[e.day] ?? 0) + 1
    return counts
  }, [filteredEntries])

  // Rows for the selected day (or the whole week, in day order), sorted by
  // start time — the input to the List and Table views and the pager below.
  const dayEntries = useMemo(() => {
    const dayIndex = (d: string) => { const i = DAYS.indexOf(d); return i === -1 ? 99 : i }
    return filteredEntries
      .filter((e: any) => showAllDays || e.day === selectedDay)
      .map((e: any) => {
        const g = groupInfo.get(e.groupId ?? e.id)
        return { ...e, __groupSize: g?.size ?? 1, __groupDayLabel: g?.label ?? (DAY_LABELS[e.day] ?? e.day) }
      })
      .sort((a: any, b: any) =>
        dayIndex(a.day) - dayIndex(b.day) ||
        a.startTime.localeCompare(b.startTime) ||
        (a.subject?.code ?? "").localeCompare(b.subject?.code ?? "")
      )
  }, [filteredEntries, selectedDay, showAllDays, groupInfo])

  // One pager shared by the List and Table views — both show the selected
  // day's rows, 10 per page. Switching between the two tabs keeps the page.
  const entriesPager = usePagination(dayEntries)

  // Unique faculty/sections/rooms in current schedule for filter dropdowns
  const entryFacultyOptions = useMemo(() => {
    const map = new Map<string, string>()
    entries.forEach((e: any) => {
      const fid = e.facultyId ?? e.faculty?.id
      if (fid && e.faculty?.user) map.set(fid, `${e.faculty.user.firstName} ${e.faculty.user.lastName}`)
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  const entrySectionOptions = useMemo(() => {
    const map = new Map<string, string>()
    entries.forEach((e: any) => {
      const sid = e.sectionId ?? e.section?.id
      if (sid && e.section?.name) map.set(sid, e.section.name)
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  const entryRoomOptions = useMemo(() => {
    const map = new Map<string, string>()
    entries.forEach((e: any) => {
      const rid = e.roomId ?? e.room?.id
      if (rid && e.room?.code) map.set(rid, e.room.code)
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  async function handleCreate() {
    // Item 7 — report EVERY blank field at once and mark them, rather than a
    // toast that names none of them and leaves the user hunting.
    const missing: string[] = []
    if (isSuperAdmin && !newDeptId) missing.push("department")
    if (!newSemType) missing.push("semester")
    if (!newSchoolYear) missing.push("schoolYear")
    if (!newStartDate) missing.push("startDate")
    if (!newEndDate) missing.push("endDate")
    setCreateMissing(missing)
    if (missing.length > 0) {
      return toast.error(`Please fill in ${missing.length} required field${missing.length === 1 ? "" : "s"} — highlighted in red`)
    }
    const normalizedSY = newSchoolYear.trim().replace(/[\s_]+/, '-')
    if (!/^\d{4}-\d{4}$/.test(normalizedSY)) return toast.error("School year format: YYYY-YYYY (e.g. 2025-2026 or 2025 2026)")
    if (new Date(newStartDate) >= new Date(newEndDate)) return toast.error("End date must be after start date")
    try {
      const newSchedule = await createSchedule.mutateAsync({
        semesterType: newSemType,
        schoolYear: normalizedSY,
        startDate: newStartDate,
        endDate: newEndDate,
        // Only the Dept Chair picks a department; omitted otherwise so the
        // server falls back to the creator's own department.
        ...(isSuperAdmin && newDeptId ? { departmentId: newDeptId } : {}),
      })
      setCreateOpen(false)
      setNewSemType("")
      setNewSchoolYear("")
      setNewStartDate("")
      setNewEndDate("")
      setNewDeptId("")
      setCreateMissing([])
      // ── Auto-select the new schedule so it is immediately visible ──
      if (newSchedule?.id) {
        setTab("active")      // new schedules are always active
        setDeptFilter("")     // clear dept filter so it isn't hidden
        setSelectedScheduleId(newSchedule.id)
      }
      toast.success("Schedule created")
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const [generateError, setGenerateError] = useState<{ message: string; details: string[] } | null>(null)

  async function handleGenerate() {
    if (!selectedScheduleId) return
    setGenerateError(null)
    try {
      const genResult = await generateSchedule.mutateAsync(selectedScheduleId)
      setGenerateOpen(false)
      // Labs-only pre-plot stage (CIT, before the Dept Chair has generated GEC):
      // only laboratory subjects were scheduled — the rest of this program's
      // major load waits until GEC exists in this schedule.
      const stagePrefix = genResult?.citLabsOnlyStage
        ? "General education subjects aren't in yet, so only laboratory subjects were placed. "
        : ""
      const pathfitNote = genResult?.pathfitPlaced > 0
        ? ` ${genResult.pathfitPlaced} PATHFIT classes placed in the GYM (faculty TBA).`
        : ""
      if (genResult?.unassignedCount > 0) {
        toast.warning(
          stagePrefix + `${genResult.entriesGenerated} entries placed.${pathfitNote} ${genResult.unassignedCount} could not be placed — see Unassigned below.`,
          { duration: 8000 }
        )
      } else if (stagePrefix) {
        toast.warning(stagePrefix + `${genResult?.entriesGenerated ?? 0} lab entries placed.`, { duration: 8000 })
      } else {
        toast.success(`Done — ${genResult?.entriesGenerated ?? "all"} entries placed.${pathfitNote}`)
      }
    } catch (err: any) {
      const details: string[] = err.details ?? []
      setGenerateError({ message: err.message, details })
      toast.error(err.message)
    }
  }

  async function handleAddEntry() {
    if (!selectedScheduleId) return
    const { subjectId, facultyId, facultyName, roomId, sectionId, day, startTime, endTime } = entryForm

    // Require either a linked faculty OR a free-text name
    if (!facultyId && !facultyName?.trim()) {
      return toast.error("Please enter a faculty name")
    }

    // Check if faculty has subjects available
    if (facultyId && filteredSubjects.length === 0) {
      return toast.error("No subjects found for this faculty's specialization. Please assign subjects in Courses / Departments first.")
    }
    // Check if subject has matching sections
    if (subjectId && filteredSections.length === 0) {
      return toast.error("No sections found for this subject. Please create sections in Courses / Departments first.")
    }

    // Split-lab-sets: Section/Subject/Faculty above are shared, but Room/Day/Time
    // are per-set — hand off to the dedicated submit path instead of falling
    // through to the single-entry fields below (which this mode doesn't fill in).
    if (splitLabSets) {
      return handleAddSplitLabSets()
    }

    const missing: string[] = []
    if (!sectionId) missing.push("section")
    if (!subjectId) missing.push("subject")
    if (!facultyId && !facultyName?.trim()) missing.push("faculty")
    if (!roomId) missing.push("room")
    if (patternDays.length === 0) missing.push("day")
    if (!startTime) missing.push("startTime")
    if (!endTime) missing.push("endTime")
    setEntryMissing(missing)
    if (missing.length > 0) {
      return toast.error(
        dayPattern === "custom" && patternDays.length === 0 && missing.length === 1
          ? "Please select at least one day"
          : `Please fill in ${missing.length} required field${missing.length === 1 ? "" : "s"} — highlighted in red`
      )
    }

    // Inactive faculty check
    const selectedFacForAdd = facultyList.find((f: any) => f.id === facultyId)
    if (selectedFacForAdd && (selectedFacForAdd.isActive === false || selectedFacForAdd.user?.isActive === false)) {
      const fname = `${selectedFacForAdd.user?.firstName ?? ""} ${selectedFacForAdd.user?.lastName ?? ""}`.trim()
      return toast.error(`${fname || "This faculty member"} is inactive and cannot be assigned to a schedule entry`)
    }

    // Lab subjects require a set (A or B)
    if (selectedSubjectForEntry?.type === "LABORATORY" && !entryForm.set) {
      return toast.error("Please select a Set (A or B) for this laboratory subject")
    }

    // ── Constraint-based validation (backtracking principles applied inline) ──
    // Only for the "single" day pattern (keyed to entryForm.day). MWF/TTh/custom
    // place the same class on several days at once — rather than duplicate every
    // check here per day, the POST route (validateEntry) re-validates each day
    // server-side and rejects the whole batch atomically, naming exactly which
    // day failed. This block stays as instant client-side feedback for the
    // common single-day case only.
    if (dayPattern === "single") {
      const toMins = (t: string) => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1])
      const overlap = (s1: string, e1: string, s2: string, e2: string) => toMins(s1) < toMins(e2) && toMins(s2) < toMins(e1)
      const sameDayEntries = entries.filter((e: any) => e.day === day)
      // "TBA" placeholder — a chair's manual resolution when no real faculty/room
      // is available yet. None of the checks below protect a real, scarce
      // resource for it, so it's exempt from all of them (mirrors the same
      // exemptions in lib/services/entry-validation.ts).
      const isTbaFaculty = isTbaFacultyEmployeeId(selectedFacultyForEntry?.employeeId)
      const isTbaRoom = isPlaceholderRoomCode((departmentRooms as any[]).find((r: any) => r.id === roomId)?.code)

      // Specialization check — faculty must be qualified for the subject
      if (!isTbaFaculty && selectedFacultyForEntry && selectedSubjectForEntry) {
        const specs: string[] = selectedFacultyForEntry.specializations ?? []
        if (specs.length > 0) {
          const titleLower = (selectedSubjectForEntry.title ?? "").toLowerCase().trim()
          const hasMatch = specs.some((sp: string) => {
            const spLower = sp.toLowerCase().trim()
            return spLower === titleLower || titleLower.includes(spLower) || spLower.includes(titleLower)
          })
          if (!hasMatch) {
            const fname = `${selectedFacultyForEntry.user?.firstName ?? ""} ${selectedFacultyForEntry.user?.lastName ?? ""}`.trim()
            return toast.error(`${fname} does not have a specialization matching "${selectedSubjectForEntry.title}". Please assign a qualified faculty member.`)
          }
        }
      }

      // Faculty conflict
      const facultyConflict = !isTbaFaculty && sameDayEntries.find((e: any) =>
        (e.facultyId === facultyId || e.faculty?.id === facultyId) &&
        overlap(startTime, endTime, e.startTime, e.endTime)
      )
      if (facultyConflict) {
        const fname = facultyConflict.faculty?.user ? `${facultyConflict.faculty.user.firstName} ${facultyConflict.faculty.user.lastName}` : "This faculty"
        return toast.error(`${fname} already has a class at ${facultyConflict.startTime}–${facultyConflict.endTime} on ${day.charAt(0) + day.slice(1).toLowerCase()}`)
      }

      // Room conflict
      const roomConflict = !isTbaRoom && sameDayEntries.find((e: any) =>
        (e.roomId === roomId || e.room?.id === roomId) &&
        overlap(startTime, endTime, e.startTime, e.endTime)
      )
      if (roomConflict) {
        return toast.error(`Room ${roomConflict.room?.code ?? ""} is already booked at ${roomConflict.startTime}–${roomConflict.endTime} on ${day.charAt(0) + day.slice(1).toLowerCase()}`)
      }

      // Section conflict — skip if both are lab entries with different sets
      const sectionConflict = sameDayEntries.find((e: any) =>
        (e.sectionId === sectionId || e.section?.id === sectionId) &&
        overlap(startTime, endTime, e.startTime, e.endTime) &&
        !(entryForm.set && e.set && entryForm.set !== e.set)
      )
      if (sectionConflict) {
        return toast.error(`Section ${sectionConflict.section?.name ?? ""} already has a class at ${sectionConflict.startTime}–${sectionConflict.endTime} on ${day.charAt(0) + day.slice(1).toLowerCase()}`)
      }

      // Faculty availability check — a faculty with NO availability rows at all
      // is unavailable (mirrors the hard rule now enforced server-side in
      // entry-validation.ts), not "no constraint configured, allow anything".
      if (facultyId && !isTbaFaculty) {
        if (facultyAvailability.length === 0) {
          const fname = `${selectedFacForAdd?.user?.firstName ?? ""} ${selectedFacForAdd?.user?.lastName ?? ""}`.trim()
          return toast.error(`${fname || "This faculty member"} has no availability set for this semester. Add their availability in Faculty Availability first.`)
        }
        const daySlots = facultyAvailability.filter((a: any) => a.day === day)
        const isWithinAvailability = daySlots.some((slot: any) =>
          toMins(slot.startTime) <= toMins(startTime) && toMins(slot.endTime) >= toMins(endTime)
        )
        if (!isWithinAvailability) {
          return toast.error("This time is outside the faculty's available hours for this day")
        }
      }
    }

    const mergedIds = mergeSectionIds.length > 0 ? [sectionId, ...mergeSectionIds.filter((x) => x !== sectionId)] : undefined
    try {
      await createEntry.mutateAsync({
        scheduleId: selectedScheduleId,
        entry: {
          ...entryForm,
          day: patternDays[0],
          days: patternDays.length > 1 ? patternDays : undefined,
          sectionIds: mergedIds,
          facultyName: entryForm.facultyName?.trim() || null,
        },
      })
      setAddEntryOpen(false)
      resetEntryForm()
      toast.success(
        mergedIds
          ? `Merged class added for ${mergedIds.length} sections${patternDays.length > 1 ? ` on ${patternDays.length} days` : ""}`
          : patternDays.length > 1 ? `Entry added on ${patternDays.length} days` : "Entry added"
      )
    } catch (err: any) {
      // Detect conflict errors — offer soft-validation override instead of hard-blocking
      // (e.g. a specialization mismatch: allowed manually with a warning, never on
      // auto-generation). Saturday, double-booking and the per-day cap are still
      // rejected outright by the server even when this retries with force: true.
      if (isOverridableConflict(err.message)) {
        setConflictMessage(err.message)
        setPendingForceCreate({
          ...entryForm,
          day: patternDays[0],
          days: patternDays.length > 1 ? patternDays : undefined,
          sectionIds: mergedIds,
          facultyName: entryForm.facultyName?.trim() || null,
        })
      } else {
        toast.error(err.message)
      }
    }
  }

  // Creates Set A and Set B together from one Add Entry submission. Section,
  // Subject and Faculty come from the shared fields above; each set supplies its
  // own Room/Day/Time. Conflict/specialization/availability checks are left to
  // the server here — the same trust boundary the MWF/TTh/custom day patterns
  // above already rely on (see the comment on the "single" dayPattern block).
  async function handleAddSplitLabSets() {
    if (!selectedScheduleId) return
    const { subjectId, sectionId, facultyId, facultyName } = entryForm

    if (!subjectId || !sectionId) {
      return toast.error("Please fill in all required fields")
    }
    for (const [label, set] of [["Set A", setAEntry], ["Set B", setBEntry]] as const) {
      if (!set.roomId || !set.day || !set.startTime || !set.endTime) {
        return toast.error(`Please fill in Room, Day and Time for ${label}`)
      }
      if (set.startTime >= set.endTime) {
        return toast.error(`${label}: End time must be after start time`)
      }
    }

    const selectedFacForAdd = facultyList.find((f: any) => f.id === facultyId)
    if (selectedFacForAdd && (selectedFacForAdd.isActive === false || selectedFacForAdd.user?.isActive === false)) {
      const fname = `${selectedFacForAdd.user?.firstName ?? ""} ${selectedFacForAdd.user?.lastName ?? ""}`.trim()
      return toast.error(`${fname || "This faculty member"} is inactive and cannot be assigned to a schedule entry`)
    }

    const shared = {
      subjectId,
      sectionId,
      facultyId,
      facultyName: facultyName?.trim() || null,
    }

    try {
      // Sequential, not parallel: if Set A fails, nothing is created and the error
      // is unambiguous. If Set A succeeds and Set B then fails, the message below
      // says so explicitly rather than leaving the chair to guess which half exists.
      await createEntry.mutateAsync({
        scheduleId: selectedScheduleId,
        entry: { ...shared, ...setAEntry, set: "A" },
      })
      try {
        await createEntry.mutateAsync({
          scheduleId: selectedScheduleId,
          entry: { ...shared, ...setBEntry, set: "B" },
        })
      } catch (err: any) {
        toast.error(`Set A was added, but Set B failed: ${err.message}`)
        return
      }
      setAddEntryOpen(false)
      resetEntryForm()
      toast.success("Set A and Set B added")
    } catch (err: any) {
      toast.error(`Set A: ${err.message}`)
    }
  }

  // Clears every field the Add Entry dialog owns. Called on a successful save AND
  // whenever the dialog closes — previously only the save path reset, so cancelling
  // left the last section/subject/faculty selected and they reappeared on reopen.
  // Seeds the edit dialog from whatever the schedule currently says, so the chair
  // corrects one wrong field instead of retyping the term.
  function openEditTerm() {
    const sem = selectedSchedule?.semester
    setTermForm({
      semesterType: sem?.type ?? "",
      schoolYear: sem?.academicYear?.label ?? "",
      startDate: sem?.startDate ? String(sem.startDate).slice(0, 10) : "",
      endDate: sem?.endDate ? String(sem.endDate).slice(0, 10) : "",
    })
    setEditTermOpen(true)
  }

  async function handleUpdateTerm() {
    if (!selectedScheduleId) return
    try {
      await updateTerm.mutateAsync({ scheduleId: selectedScheduleId, ...termForm })
      setEditTermOpen(false)
      toast.success("Schedule term updated")
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  function resetEntryForm() {
    setEntryForm({ subjectId: "", facultyId: "", facultyName: "", roomId: "", sectionId: "", day: "", startTime: "", endTime: "", set: "" })
    setDayPattern("single")
    setCustomDays([])
    setFacultySearch("")
    setSectionSearch("")
    // The two comboboxes keep their own open/closed flag. Left set, a dialog closed
    // with a dropdown open reopened with that dropdown still hanging over the form.
    setFacultyDropdownOpen(false)
    setSectionDropdownOpen(false)
    setSplitLabSets(false)
    setSetAEntry({ roomId: "", day: "", startTime: "", endTime: "" })
    setSetBEntry({ roomId: "", day: "", startTime: "", endTime: "" })
    setMergeSectionIds([])
    setEntryMissing([])
  }

  function handleOpenEditEntry(entryId: string) {
    const entry = entries.find((e: any) => e.id === entryId)
    if (!entry) return
    setEditEntryId(entryId)
    setEditEntryForm({
      subjectId: entry.subjectId ?? entry.subject?.id ?? "",
      facultyId: entry.facultyId ?? entry.faculty?.id ?? "",
      roomId: entry.roomId ?? entry.room?.id ?? "",
      sectionId: entry.sectionId ?? entry.section?.id ?? "",
      day: entry.day ?? "",
      startTime: entry.startTime ?? "",
      endTime: entry.endTime ?? "",
      set: (entry.set ?? "") as "" | "A" | "B",
    })
    // Merged NSTP class: every section in the group (any day) — the list the
    // NSTP Director edits below. A plain NSTP class starts with its one section.
    const groupSections = entry.mergeGroupId
      ? [...new Set(entries.filter((e: any) => e.mergeGroupId === entry.mergeGroupId).map((e: any) => e.sectionId ?? e.section?.id))]
      : [entry.sectionId ?? entry.section?.id]
    setEditMergeSectionIds(groupSections.filter(Boolean) as string[])
    setEditMergeAddId("")
    setEditSectionSearch("")
    setEditMissing([])
    setEditEntryOpen(true)
  }

  async function handleUpdateEntry() {
    if (!selectedScheduleId || !editEntryId) return
    const { subjectId, facultyId, roomId, sectionId, day, startTime, endTime } = editEntryForm

    // Check if faculty has subjects available
    if (facultyId && editFilteredSubjects.length === 0) {
      return toast.error("No subjects found for this faculty's specialization. Please assign subjects in Courses / Departments first.")
    }
    // Check if subject has matching sections
    if (subjectId && editFilteredSections.length === 0) {
      return toast.error("No sections found for this subject. Please create sections in Courses / Departments first.")
    }

    const missing: string[] = []
    if (!facultyId) missing.push("faculty")
    if (!subjectId) missing.push("subject")
    if (!sectionId) missing.push("section")
    if (!roomId) missing.push("room")
    if (!day) missing.push("day")
    if (!startTime) missing.push("startTime")
    if (!endTime) missing.push("endTime")
    setEditMissing(missing)
    if (missing.length > 0) {
      return toast.error(`Please fill in ${missing.length} required field${missing.length === 1 ? "" : "s"} — highlighted in red`)
    }

    // Inactive faculty check
    const selectedFacForEdit = facultyList.find((f: any) => f.id === facultyId)
    if (selectedFacForEdit && (selectedFacForEdit.isActive === false || selectedFacForEdit.user?.isActive === false)) {
      const fname = `${selectedFacForEdit.user?.firstName ?? ""} ${selectedFacForEdit.user?.lastName ?? ""}`.trim()
      return toast.error(`${fname || "This faculty member"} is inactive and cannot be assigned to a schedule entry`)
    }

    // Lab subjects require a set (A or B)
    if (editSelectedSubject?.type === "LABORATORY" && !editEntryForm.set) {
      return toast.error("Please select a Set (A or B) for this laboratory subject")
    }

    // ── Constraint-based validation on edit ──
    const toMins = (t: string) => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1])
    const overlap = (s1: string, e1: string, s2: string, e2: string) => toMins(s1) < toMins(e2) && toMins(s2) < toMins(e1)
    // Sibling rows of a merged NSTP class (same mergeGroupId) are the SAME class
    // — they share the faculty, room and time by design — so they are not
    // "other" entries for the faculty/room checks below (server does the same).
    const editingMergeGroupId = entries.find((e: any) => e.id === editEntryId)?.mergeGroupId ?? null
    const otherEntries = entries.filter((e: any) =>
      e.id !== editEntryId && e.day === day && !(editingMergeGroupId && e.mergeGroupId === editingMergeGroupId)
    )
    // "TBA" placeholder — exempt from the checks that exist to protect a real,
    // scarce resource (mirrors entry-validation.ts and Add Entry's handleAddEntry).
    const isTbaFacultyEdit = isTbaFacultyEmployeeId(selectedFacForEdit?.employeeId)
    const isTbaRoomEdit = isPlaceholderRoomCode((departmentRooms as any[]).find((r: any) => r.id === roomId)?.code)

    // Faculty conflict
    const fc = !isTbaFacultyEdit && otherEntries.find((e: any) => (e.facultyId === facultyId || e.faculty?.id === facultyId) && overlap(startTime, endTime, e.startTime, e.endTime))
    if (fc) return toast.error(`Faculty already has a class at ${fc.startTime}–${fc.endTime} on ${day.charAt(0) + day.slice(1).toLowerCase()}`)

    // Room conflict
    const rc = !isTbaRoomEdit && otherEntries.find((e: any) => (e.roomId === roomId || e.room?.id === roomId) && overlap(startTime, endTime, e.startTime, e.endTime))
    if (rc) return toast.error(`Room is already booked at ${rc.startTime}–${rc.endTime} on ${day.charAt(0) + day.slice(1).toLowerCase()}`)

    // Section conflict — skip if both are lab entries with different sets
    const sc = otherEntries.find((e: any) =>
      (e.sectionId === sectionId || e.section?.id === sectionId) &&
      overlap(startTime, endTime, e.startTime, e.endTime) &&
      !(editEntryForm.set && e.set && editEntryForm.set !== e.set)
    )
    if (sc) return toast.error(`Section already has a class at ${sc.startTime}–${sc.endTime} on ${day.charAt(0) + day.slice(1).toLowerCase()}`)

    // Faculty availability check — a faculty with NO availability rows at all
    // (or none on this specific day) is unavailable, matching the hard rule
    // enforced server-side in entry-validation.ts. Previously this skipped the
    // check entirely whenever rows were missing, letting an entry save with no
    // warning even though "no availability" was shown right on the form.
    if (facultyId && !isTbaFacultyEdit) {
      if (editFacultyAvailability.length === 0) {
        return toast.error("This faculty has no availability set for this semester. Add their availability in Faculty Availability first.")
      }
      const daySlots = editFacultyAvailability.filter((a: any) => a.day === day)
      const isWithinAvailability = daySlots.some((slot: any) =>
        toMins(slot.startTime) <= toMins(startTime) && toMins(slot.endTime) >= toMins(endTime)
      )
      if (!isWithinAvailability) {
        return toast.error("This time is outside the faculty's available hours for this day")
      }
    }

    // Specialization check
    const editFaculty = facultyList.find((f: any) => f.id === facultyId)
    const editSubject = subjects.find((s: any) => s.id === subjectId)
    if (!isTbaFacultyEdit && editFaculty && editSubject) {
      const specs: string[] = editFaculty.specializations ?? []
      if (specs.length > 0) {
        const titleLower = (editSubject.title ?? "").toLowerCase().trim()
        const hasMatch = specs.some((sp: string) => {
          const spLower = sp.toLowerCase().trim()
          return spLower === titleLower || titleLower.includes(spLower) || spLower.includes(titleLower)
        })
        if (!hasMatch) {
          return toast.error(`${editFaculty.user?.firstName} ${editFaculty.user?.lastName} does not specialize in "${editSubject.title}"`)
        }
      }
    }

    try {
      const editingEntry = entries.find((e: any) => e.id === editEntryId)
      const nstpMergeEdit = isNstpCode(editSelectedSubject?.code) && (editingEntry?.mergeGroupId || editMergeSectionIds.length > 1)
      const result = await updateEntry.mutateAsync({
        scheduleId: selectedScheduleId,
        entryId: editEntryId,
        // A merged NSTP class keeps its sections through the section LIST —
        // the single sectionId field is what the primary row already has.
        changes: nstpMergeEdit
          ? { ...editEntryForm, sectionId: undefined, sectionIds: editMergeSectionIds }
          : editEntryForm,
      })
      setEditEntryOpen(false)
      setEditEntryId(null)
      if (result.warning) {
        toast.warning(`Saved with conflict: ${result.warning}`, { duration: 6000 })
      } else {
        toast.success(nstpMergeEdit && editMergeSectionIds.length > 1 ? `Merged class updated (${editMergeSectionIds.length} sections)` : "Entry updated")
      }
    } catch (err: any) {
      // Detect conflict errors — offer soft-validation override instead of hard-blocking
      if (isOverridableConflict(err.message) && editEntryId) {
        setConflictMessage(err.message)
        setPendingForceChanges({ ...editEntryForm })
        setForceEntryId(editEntryId)
      } else {
        toast.error(err.message)
      }
    }
  }

  async function handleForceOverride() {
    if (!selectedScheduleId) return
    try {
      if (pendingForceCreate) {
        const result = await createEntry.mutateAsync({
          scheduleId: selectedScheduleId,
          entry: { ...pendingForceCreate, force: true } as any,
        })
        setConflictMessage(null)
        setPendingForceCreate(null)
        setAddEntryOpen(false)
        resetEntryForm()
        toast.warning(result.warning ? `Added with conflict: ${result.warning}` : "Entry added (conflict overridden)", { duration: 6000 })
        return
      }
      if (!pendingForceChanges || !forceEntryId) return
      const result = await updateEntry.mutateAsync({
        scheduleId: selectedScheduleId,
        entryId: forceEntryId,
        changes: { ...pendingForceChanges, force: true },
      })
      setConflictMessage(null)
      setPendingForceChanges(null)
      setForceEntryId(null)
      setEditEntryOpen(false)
      setEditEntryId(null)
      toast.warning(result.warning ? `Saved with conflict: ${result.warning}` : "Entry saved (conflict overridden)", { duration: 6000 })
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Pre-publish: open validation dialog with constraint checks
  async function handlePrePublish() {
    if (!selectedScheduleId) return
    setPublishValidation({ loading: true, errors: [], warnings: [], entryCount: 0 })
    setPublishValidationOpen(true)
    try {
      const res = await fetch(`/api/schedules/${selectedScheduleId}/validate`)
      const json = await res.json()
      const data = json.data ?? json
      setPublishValidation({
        loading: false,
        errors: data.errors ?? [],
        warnings: data.warnings ?? [],
        entryCount: data.entryCount ?? 0,
      })
    } catch {
      setPublishValidation({ loading: false, errors: [{ type: "UNKNOWN", description: "Failed to validate schedule" }], warnings: [], entryCount: 0 })
    }
  }

  async function handlePublish() {
    if (!selectedScheduleId) return
    try {
      const result: any = await publishSchedule.mutateAsync(selectedScheduleId)
      if (result?._status === 422) {
        toast.error(`Cannot publish: ${result.errors?.length ?? 0} blocking conflict(s) must be resolved first`)
      } else {
        setPublishValidationOpen(false)
        toast.success("Schedule published successfully!")
      }
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Marks a single ConflictLog row resolved (chair fixed the underlying entry
  // manually) and refetches the schedule so the banner/calendar/Approve gate
  // all drop it immediately.
  async function handleResolveConflict(conflictId: string) {
    if (!selectedScheduleId) return
    setResolvingConflictId(conflictId)
    try {
      const res = await fetch(`/api/schedules/${selectedScheduleId}/conflicts/${conflictId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to resolve conflict")
      queryClient.invalidateQueries({ queryKey: ["schedules", selectedScheduleId] })
      toast.success("Conflict marked resolved")
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setResolvingConflictId(null)
    }
  }

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "ADMIN", "DEAN", "PATHFIT", "NSTP"]}>
    <Suspense fallback={null}>
      <ScheduleDeepLink onOpen={(id) => { setTab("active"); setSelectedScheduleId(id) }} />
    </Suspense>

    {/* ── Full-page loading overlay shown while a new schedule is being created ── */}
    {createSchedule.isPending && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-12 py-10 shadow-2xl">
          <Loader2 className="h-10 w-10 animate-spin text-[#1B4332]" />
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Creating Schedule…</p>
            <p className="text-xs text-muted-foreground mt-1">Setting up semester and academic year</p>
          </div>
        </div>
      </div>
    )}

    <div className="space-y-6">
      {/* While the role/department fetch is in flight, show a skeleton — not the
          FACULTY fallback below, which used to flash for every real chair. */}
      {currentUserPending ? (
        <ScheduleListSkeleton />
      ) : userRole === "FACULTY" ? (
        /* Faculty have no login access (RoleGuard already redirects them) — this is
           a defensive fallback, not a state a real user should ever reach. */
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              This area is available to Department and Program Chairpersons only.
            </p>
          </CardContent>
        </Card>
      ) : (
      <>
      <PageHeader
        action={
          /* Toolbar: only the primary workflow actions stay as buttons —
             New Schedule, Generate, Publish/Notify/Unpublish. Everything else
             (Add Entry, Export, Workflow Guide, Archive, Delete) lives in the ⋯
             overflow menu, which keeps this from wrapping into several rows of
             buttons once a schedule is selected. */
          <div className="flex flex-wrap items-center gap-2">
            {(isSuperAdmin || isAdmin) && (
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">New Schedule</span>
                <span className="sm:hidden">New</span>
              </Button>
            )}
            {selectedScheduleId && canGenerate && (
              <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)} className="bg-[#1B4332] text-white hover:bg-[#2D6A4F]">
                <Cpu className="mr-2 h-4 w-4" />
                <span>{userRole === "PATHFIT" ? "Generate PATHFit" : "Generate"}</span>
              </Button>
            )}
            {selectedScheduleId && canPublish && (
              <Button
                size="sm"
                onClick={handlePrePublish}
                disabled={publishSchedule.isPending}
                className="bg-[#1B4332] hover:bg-[#2D6A4F] text-white"
              >
                {publishSchedule.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  isAdmin
                    ? <BellRing className="mr-2 h-4 w-4" />
                    : <Globe className="mr-2 h-4 w-4" />
                )}
                {isAdmin ? "Notify Faculty" : "Publish Schedule"}
              </Button>
            )}
            {selectedScheduleId && canUnpublish && (
              <Button
                size="sm"
                variant="outline"
                className="border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332]/10"
                onClick={async () => {
                  try {
                    await unpublishSchedule.mutateAsync(selectedScheduleId)
                    toast.success("Schedule unpublished — now in Draft mode")
                  } catch (err: any) {
                    toast.error(err.message)
                  }
                }}
                disabled={unpublishSchedule.isPending}
              >
                {unpublishSchedule.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="mr-2 h-4 w-4" />
                )}
                Unpublish
              </Button>
            )}
            {/* ⋯ overflow — secondary actions. Add Entry / Export / Archive /
                Delete only apply to a selected schedule; Workflow Guide is
                always available, so the menu never renders empty. */}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="px-2" aria-label="More actions" />}>
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {selectedScheduleId && canAddEntry && (
                  <DropdownMenuItem onClick={() => { setSectionSearch(""); setAddEntryOpen(true) }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Entry
                  </DropdownMenuItem>
                )}
                {selectedScheduleId && entries.length > 0 && (
                  <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export
                  </DropdownMenuItem>
                )}
                {/* Archive / Unarchive + Delete — Dept Chair on any schedule,
                    Program Chair on their own department's. */}
                {selectedScheduleId && canArchiveOrDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={archiveSchedule.isPending}
                      onClick={() => {
                        const action = tab === "archived" ? "unarchive" : "archive"
                        archiveSchedule.mutate(
                          { scheduleId: selectedScheduleId, action },
                          {
                            onSuccess: () => {
                              toast.success(action === "archive" ? "Schedule archived" : "Schedule restored")
                              setSelectedScheduleId(null)
                            },
                            onError: (err: any) => toast.error(err.message),
                          }
                        )
                      }}
                    >
                      {tab === "archived" ? (
                        <><ArchiveRestore className="mr-2 h-4 w-4" />Unarchive</>
                      ) : (
                        <><Archive className="mr-2 h-4 w-4" />Archive</>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => setDeleteConfirmOpen(true)}
                      disabled={deleteSchedule.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* ── Workflow Action Strip ─────────────────────────────────────────────
          Program Chairperson on DRAFT: who is done plotting, "Mark my subjects as
          done" and "Submit for Approval" (unlocks once everyone is done). Dean on
          PENDING_APPROVAL: Approve / Return for Revision.
      ── */}
      {selectedScheduleId && selectedSchedule && (
        <WorkflowActions
          scheduleId={selectedScheduleId}
          status={selectedSchedule.status}
          userRole={userRole}
          departmentName={selectedSchedule.department?.name}
          isOwnSchedule={isAdmin ? isOwnSchedule : isDean ? isDeanOwnSchedule : isSuperAdminOwnSchedule}
          myProgramId={isAdmin ? ((currentUser as any)?.programHead?.programId ?? null) : null}
          unresolvedConflictCount={blockingConflictCount}
          gecReady={gecReady}
          onStatusChange={() => {
            // Invalidation is handled inside WorkflowActions via useQueryClient
          }}
        />
      )}

      {/* CIT lab-change requests (spec Section 2). The panel hides itself when there's
          nothing relevant for the current role. */}
      {selectedScheduleId && selectedSchedule && (isSuperAdmin || isAdmin) && (
        <LabRequestsPanel scheduleId={selectedScheduleId} isSuperAdmin={isSuperAdmin} />
      )}

      {/* Rejection-reason banner — shown once a rejected DRAFT is reopened for
          revision. Dismiss is client-side only (no API call); the dismissed key
          is tied to updatedAt so a *new* rejection on the same schedule re-shows it. */}
      {selectedScheduleId && selectedSchedule?.status === "DRAFT" && selectedSchedule?.rejectionReason &&
        dismissedRejectionKey !== `${selectedSchedule.id}:${selectedSchedule.updatedAt}` && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Returned by the Dean — Revision Requested</p>
            <p className="mt-0.5 text-red-700">{selectedSchedule.rejectionReason}</p>
          </div>
          <button
            onClick={() => setDismissedRejectionKey(`${selectedSchedule.id}:${selectedSchedule.updatedAt}`)}
            className="shrink-0 rounded p-1 text-red-600 hover:bg-red-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Waiting-for-GEC banner — Program Chair on their own DRAFT before ALL
          THREE CAS cluster chairpersons have finalized GEC/GEL. */}
      {selectedScheduleId && waitingForGec && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Workflow className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="min-w-0">
            <p className="font-medium">Waiting for GEC/GEL to be finalized</p>
            <p className="mt-0.5 text-amber-700">
              {chairIsCit
                ? "Step 1: you can pre-plot your laboratory subjects now. Lecture and other major subjects, Generate for the full load, and Submit unlock once all three CAS department heads have finalized GEC/GEL."
                : "Add Entry, Generate and Submit unlock once all three CAS department heads have finalized GEC/GEL for this schedule. Your major subjects are built around that backbone."}
            </p>
            {gecClusters.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {gecClusters.map((c) => (
                  <li key={c.id} className="flex items-center gap-1.5 text-xs">
                    {c.finalized ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    )}
                    <span className={c.finalized ? "text-green-700" : "text-amber-700"}>
                      {c.name}{c.finalized ? ` — finalized${c.finalizedBy ? ` by ${c.finalizedBy}` : ""}` : " — pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* GEC/GEL Finalization — CAS Dept Chairperson control. Declares their
          cluster's GEC/GEL scheduling for THIS schedule complete; Program
          Chairpersons unlock once every cluster has done this. Shown for any
          selected schedule (own CAS schedule included, for consistency), not
          just non-CAS ones — finalizing the CAS schedule itself is harmless,
          it just doesn't gate anything there (CAS has no Program Chairpersons). */}
      {selectedScheduleId && isSuperAdmin && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 min-w-0">
            <p className="font-medium">GEC/GEL finalization <span className="font-normal text-muted-foreground">— by department head</span></p>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {gecClusters.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {c.finalized ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  )}
                  <span>
                    {c.name}
                    {c.finalized && c.finalizedBy ? ` (${c.finalizedBy})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {myClusterId ? (
            <Button
              size="sm"
              variant={myClusterStatus?.finalized ? "outline" : "default"}
              className={myClusterStatus?.finalized ? "" : "bg-[#1B4332] text-white hover:bg-[#2D6A4F]"}
              disabled={gecFinalizeMutation.isPending}
              onClick={() =>
                gecFinalizeMutation.mutate({ action: myClusterStatus?.finalized ? "unfinalize" : "finalize" })
              }
            >
              {gecFinalizeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {myClusterStatus?.finalized ? "Reopen my GEC/GEL" : "Finalize my GEC/GEL"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              You have no department head area assigned — set it under Settings, or ask another Department Chairperson to finalize on their area&apos;s behalf.
            </p>
          )}
        </div>
      )}

      {/* Read-only banner — ADMIN viewing another department's schedule */}
      {isAdmin && selectedScheduleId && !isOwnSchedule && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <BookOpen className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
          <div>
            <p className="font-medium">Department Chairperson&apos;s Schedule — Read Only</p>
            <p className="mt-0.5 text-blue-700">
              This schedule belongs to the CAS Department Chairperson. To manage your program&apos;s subjects,
              use the <strong>New Schedule</strong> button to create your own schedule.
            </p>
          </div>
        </div>
      )}


      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left: Schedule List */}
        <div className="space-y-3">
          {/* Active / Archived tabs */}
          <Tabs value={tab} onValueChange={(v) => { if (v) { setTab(v); setSelectedScheduleId(null) } }}>
            <TabsList className="w-full">
              <TabsTrigger value="active" className="flex-1">
                Active
                {visibleActiveCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-[#1B4332]/15 text-[#1B4332] px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                    {visibleActiveCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="archived" className="flex-1">
                Archived
                {visibleArchivedCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                    {visibleArchivedCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Schedule-list filters — semester and (for Dept Chairs seeing more
              than one department) department, on one row. They used to be two
              stacked rows each with its own Clear link; one row with a single
              Clear reads as one control group instead of a column of widgets. */}
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <select
              value={semFilter}
              onChange={(e) => { setSemFilter(e.target.value); setSelectedScheduleId(null) }}
              className="min-w-0 flex-1 h-8 rounded-lg border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring truncate"
            >
              <option value="">All Semesters</option>
              <option value="FIRST">1st Semester</option>
              <option value="SECOND">2nd Semester</option>
              <option value="SUMMER">Summer</option>
            </select>
            {deptOptions.length > 1 && (
              <select
                value={deptFilter}
                onChange={(e) => { setDeptFilter(e.target.value); setSelectedScheduleId(null) }}
                className="min-w-0 flex-1 h-8 rounded-lg border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring truncate"
              >
                <option value="">All Departments</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            )}
            {(semFilter || deptFilter) && (
              <button
                onClick={() => { setSemFilter(""); setDeptFilter(""); setSelectedScheduleId(null) }}
                className="text-[10px] text-red-500 hover:text-red-600 underline shrink-0"
              >
                Clear
              </button>
            )}
          </div>

          {isLoading ? (
            <ScheduleListSkeleton />
          ) : schedules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {isAdmin && !adminDeptId ? (
                <>
                  <p className="font-medium text-amber-700">Your account isn&apos;t linked to a department</p>
                  <p className="mt-1">
                    Schedules are scoped to a Program Chairperson&apos;s own department, so none can be shown
                    until yours is set. Ask a Department Chairperson to open <strong>User Management</strong>{" "}
                    and assign your department and program.
                  </p>
                </>
              ) : deptFilter ? (
                `No ${tab} schedules for this department`
              ) : (
                `No ${tab} schedules`
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {schedulesPager.pageItems.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedScheduleId(s.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedScheduleId === s.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">
                      {s.semester?.type === "FIRST"
                        ? "1st Semester"
                        : s.semester?.type === "SECOND"
                        ? "2nd Semester"
                        : "Summer"}{" "}
                      {s.semester?.academicYear?.label}
                    </p>
                    <ScheduleStatusBadge status={s.status} />
                  </div>
                  {/* Owning college/department — identifies the schedule without needing a filter */}
                  {s.department && (
                    <div className="mt-1 flex items-center gap-1.5 min-w-0">
                      <span className="inline-flex items-center rounded bg-[#1B4332]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1B4332] shrink-0">
                        {s.department.college?.abbreviation ?? s.department.abbreviation}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">
                        {s.department.name}
                      </span>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s._count?.entries ?? 0} entries
                    {s.semester?.startDate && s.semester?.endDate && (
                      <> &middot; {new Date(s.semester.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {new Date(s.semester.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
                    )}
                  </p>
                </button>
              ))}
              <PaginationControls
                size="sm"
                page={schedulesPager.page}
                pageCount={schedulesPager.pageCount}
                onPageChange={schedulesPager.setPage}
                total={schedulesPager.total}
                from={schedulesPager.from}
                to={schedulesPager.to}
              />
            </div>
          )}
        </div>

        {/* Right: Schedule Detail */}
        {/* min-w-0 is load-bearing: a grid item defaults to min-width:auto, so without
            it the 1fr track grows to fit its widest child (long queue text, the
            calendar) and the whole page scrolls horizontally instead of the child. */}
        <div className="min-w-0">
          {!selectedScheduleId ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
              Select a schedule to view its entries
            </div>
          ) : loadingSchedule ? (
            <ScheduleDetailSkeleton />
          ) : (
            <div className="space-y-4">
              {/* ── Conflicts & Unassigned Queue ──────────────────────────────
                  Both used to render *below* the entry list, where a schedule
                  with a few hundred entries buried them off-screen — the two
                  things a chair most needs to act on were the hardest to find.
                  They now sit directly above the List/Calendar tabs, each one
                  collapsible and internally scrollable so a long list can never
                  push the schedule itself out of view. */}
              {unresolvedConflicts.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50/50">
                  <button
                    onClick={() => setConflictsOpen((o) => !o)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
                    aria-expanded={conflictsOpen}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                    <span className="text-sm font-semibold text-red-700">
                      Conflicts ({unresolvedConflicts.length})
                    </span>
                    <span className="hidden truncate text-xs text-red-800/70 sm:inline">
                      — resolve before publishing
                    </span>
                    {conflictsOpen
                      ? <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-red-600" />
                      : <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-red-600" />}
                  </button>
                  {conflictsOpen && (
                    <div className="max-h-64 space-y-2 overflow-y-auto border-t border-red-200 p-3">
                      {unresolvedConflicts.map((c: any) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5"
                        >
                          <p className="min-w-0 text-sm text-red-800 break-words">{c.description}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-red-300 text-xs hover:border-red-400"
                            disabled={resolvingConflictId === c.id}
                            onClick={() => handleResolveConflict(c.id)}
                          >
                            {resolvingConflictId === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Mark Resolved"
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedSchedule?.unassigned?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50">
                  <button
                    onClick={() => setUnassignedOpen((o) => !o)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
                    aria-expanded={unassignedOpen}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="text-sm font-semibold text-amber-700">
                      Unassigned Queue ({selectedSchedule.unassigned.length})
                    </span>
                    <span className="hidden truncate text-xs text-amber-800/70 sm:inline">
                      — could not be scheduled automatically
                    </span>
                    {unassignedOpen
                      ? <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-amber-600" />
                      : <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-amber-600" />}
                  </button>
                  {unassignedOpen && (
                    <div className="max-h-64 space-y-2 overflow-y-auto border-t border-amber-200 p-3">
                      {selectedSchedule.unassigned.map((u: any) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            {/* Explicit text-amber-900: this row's amber-50 background is
                                opaque, so it stays light in both themes — but with no color
                                class here this <p> fell back to the page's default text
                                color, which is near-white in dark mode. White text on this
                                permanently-light card was invisible. */}
                            <p className="text-sm font-medium text-amber-900 break-words">
                              {u.subject?.code} — {u.subject?.title}
                            </p>
                            <p className="text-xs text-amber-700 break-words">
                              {u.section?.name} &middot; {u.reason ?? "No slot available"}
                            </p>
                          </div>
                          {canModifyEntries && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="shrink-0 border-amber-300 text-xs hover:border-amber-400"
                              onClick={() => {
                                setEntryForm((prev: any) => ({
                                  ...prev,
                                  subjectId: u.subjectId,
                                  sectionId: u.sectionId,
                                }))
                                setAddEntryOpen(true)
                              }}
                            >
                              Manually Assign
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Tabs value={view} onValueChange={(v) => v && setView(v)}>
                {/* Header row: date range, view tabs, status badge. The entry count now
                    lives in the shared filter bar below (as "X of Y"); Archive/Delete
                    live in the page's ⋯ action menu. */}
                <div className="flex flex-wrap items-center gap-3">
                  {selectedSchedule?.semester?.startDate && selectedSchedule?.semester?.endDate && (
                    <p className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                      {new Date(selectedSchedule.semester.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {" \u2014 "}
                      {new Date(selectedSchedule.semester.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {/* Correct a mistyped semester, school year or date without deleting
                          the schedule and re-entering everything. Drafts only \u2014 the API
                          refuses once the schedule has been submitted or published. */}
                      {isDraft && canArchiveOrDelete && (
                        <button
                          onClick={openEditTerm}
                          title="Edit semester, school year and dates"
                          className="rounded p-1 text-[#1B4332] transition-colors hover:bg-[#1B4332]/10"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </p>
                  )}
                  <TabsList className="shrink-0">
                    <TabsTrigger value="list">
                      <Filter className="mr-1.5 h-3.5 w-3.5" />
                      List
                    </TabsTrigger>
                    <TabsTrigger value="table">
                      <Rows3 className="mr-1.5 h-3.5 w-3.5" />
                      Table
                    </TabsTrigger>
                    <TabsTrigger value="calendar">
                      <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                      Calendar
                    </TabsTrigger>
                  </TabsList>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <ScheduleStatusBadge status={selectedSchedule?.status} />
                  </div>
                </div>

                {/* One shared filter bar for BOTH views. It used to be duplicated
                    inside each TabsContent — the same six controls rendered twice,
                    which made the section look busier than it is and made filters
                    appear to reset when switching between List and Calendar. */}
                {entries.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
                    <div className="relative flex-1 min-w-[180px] max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search entries..."
                        value={entrySearch}
                        onChange={(e) => setEntrySearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <select
                      value={calFilterFaculty}
                      onChange={(e) => setCalFilterFaculty(e.target.value)}
                      className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">All Faculty</option>
                      {entryFacultyOptions.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <select
                      value={calFilterSection}
                      onChange={(e) => setCalFilterSection(e.target.value)}
                      className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">All Sections</option>
                      {entrySectionOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <select
                      value={calFilterRoom}
                      onChange={(e) => setCalFilterRoom(e.target.value)}
                      className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">All Rooms</option>
                      {entryRoomOptions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    {(calFilterFaculty || calFilterSection || calFilterRoom || entrySearch) && (
                      <button
                        onClick={() => { setCalFilterFaculty(""); setCalFilterSection(""); setCalFilterRoom(""); setEntrySearch("") }}
                        className="text-xs text-red-600 hover:text-red-700 underline"
                      >
                        Clear
                      </button>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                      {showAllDays
                        ? `${filteredEntries.length} of ${entries.length} entries this week`
                        : `${dayEntries.length} on ${DAY_FULL[selectedDay] ?? selectedDay} · ${filteredEntries.length} of ${entries.length} this week`}
                    </span>
                  </div>
                )}

                {/* ── Day navigation ─────────────────────────────────────────
                    "All" shows the whole week; a weekday shows one day at a time —
                    in every view. Each tab carries its class count (after the
                    filters above). */}
                {entries.length > 0 && (
                  <div className="mt-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Day of week">
                    {["ALL", ...DAYS].map((day) => {
                      const isActive = selectedDay === day
                      const count = day === "ALL" ? filteredEntries.length : (entriesPerDay[day] ?? 0)
                      return (
                        <button
                          key={day}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setSelectedDay(day)}
                          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            isActive
                              ? "border-[#1B4332] bg-[#1B4332] text-white"
                              : count > 0
                                ? "border-border bg-background text-foreground hover:bg-muted"
                                : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <span className="sm:hidden">{day === "ALL" ? "All" : (DAY_LABELS[day] ?? day.slice(0, 3))}</span>
                          <span className="hidden sm:inline">{day === "ALL" ? "All days" : (DAY_FULL[day] ?? day)}</span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                              isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                <TabsContent value="list" className="mt-4 space-y-3">
                  {entries.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                      No entries yet. Use &ldquo;Add Entry&rdquo; to add classes by hand, or &ldquo;Generate&rdquo; to build the timetable automatically.
                    </div>
                  ) : dayEntries.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                      {filteredEntries.length === 0
                        ? "No entries match your search/filter criteria."
                        : `No classes on ${DAY_FULL[selectedDay] ?? selectedDay}. Pick another day above.`}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* This page's rows (10 per page) — one card per day, each
                          grouped by time slot. A multi-day (MWF/TTh) class shows on
                          each of its days with a pattern badge. */}
                      {DAYS.map((day) => {
                        const rows = entriesPager.pageItems.filter((e: any) => e.day === day)
                        if (rows.length === 0) return null

                        // Group by time slot
                        const timeGroups: Record<string, any[]> = {}
                        for (const entry of rows) {
                          const key = `${entry.startTime}–${entry.endTime}`
                          if (!timeGroups[key]) timeGroups[key] = []
                          timeGroups[key].push(entry)
                        }

                        return (
                          <Card key={day}>
                            <div className="bg-[#1B4332] text-white px-4 py-2 rounded-t-lg">
                              <h3 className="text-sm font-semibold">
                                {day.charAt(0) + day.slice(1).toLowerCase()}
                              </h3>
                            </div>
                            <CardContent className="p-0 divide-y">
                              {Object.entries(timeGroups).map(([timeSlot, slotEntries]) => (
                                <div key={timeSlot} className="flex flex-col sm:flex-row">
                                  {/* Time column */}
                                  <div className="sm:w-24 shrink-0 sm:border-r bg-muted/30 px-3 py-2 sm:py-3 flex items-center sm:items-start">
                                    <span className="text-xs font-semibold text-[#1B4332]">
                                      {timeSlot}
                                    </span>
                                  </div>
                                  {/* Schedule cards stacked vertically */}
                                  <div className="flex-1 p-2 space-y-1.5">
                                    {slotEntries.map((entry: any) => (
                                      <div
                                        key={entry.id}
                                        className={`group flex items-center justify-between rounded-lg border bg-card px-3 py-2 hover:shadow-sm transition-shadow ${canEditEntry(entry) ? "cursor-pointer" : ""}`}
                                        onClick={() => {
                                          if (canEditEntry(entry)) handleOpenEditEntry(entry.id)
                                        }}
                                      >
                                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                          <div className={`w-1 h-8 rounded-full shrink-0 ${
                                            entry.subject?.type === "LABORATORY" ? "bg-[#2D6A4F]"
                                            : "bg-[#1B4332]"
                                          }`} />
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                                              <span className="text-xs sm:text-sm font-semibold text-foreground">{entry.subject?.code}</span>
                                              {entry.__groupSize > 1 && (
                                                <span
                                                  className="inline-flex items-center rounded bg-[#1B4332]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#1B4332] shrink-0"
                                                  title={`Meets ${entry.__groupSize}x/week — all sessions move together`}
                                                >
                                                  {entry.__groupDayLabel}
                                                </span>
                                              )}
                                              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">{entry.subject?.title}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 mt-0.5 text-[11px] sm:text-xs text-muted-foreground">
                                              <span>
                                                {entry.facultyName ||
                                                  `${entry.faculty?.user?.firstName ?? ""} ${entry.faculty?.user?.lastName ?? ""}`.trim() ||
                                                  "—"}
                                              </span>
                                              <span className="font-mono">{entry.room?.code}</span>
                                              <span>{entrySectionLabel(entry)}</span>
                                              {entry.__mergedSections?.length > 1 && (
                                                <span className="inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-800" title="One class held for several sections together">
                                                  Merged · {entry.__mergedSections.length}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        {canEditEntry(entry) && (
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleOpenEditEntry(entry.id)
                                              }}
                                              className="p-1 rounded hover:bg-[#1B4332]/10 text-[#1B4332] transition-colors"
                                              title="Edit entry"
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setDeleteEntryId(entry.id)
                                              }}
                                              className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors"
                                              title="Delete entry"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )
                      })}
                      <PaginationControls
                        page={entriesPager.page}
                        pageCount={entriesPager.pageCount}
                        onPageChange={entriesPager.setPage}
                        total={entriesPager.total}
                        from={entriesPager.from}
                        to={entriesPager.to}
                        label="classes"
                      />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="table" className="mt-4">
                  {/* Table view — the same entries as the List, but as a scannable
                      grid. The List groups by day into cards, which reads well for a
                      light schedule and poorly for a dense one; this sorts flat by day
                      then start time so a whole week is comparable at a glance. */}
                  {entries.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                      No entries yet. Use &ldquo;Add Entry&rdquo; to add a class by hand, or &ldquo;Generate&rdquo; to build the timetable automatically.
                    </div>
                  ) : dayEntries.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                      {filteredEntries.length === 0
                        ? "No entries match your search/filter criteria."
                        : `No classes on ${DAY_FULL[selectedDay] ?? selectedDay}. Pick another day above.`}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[760px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-muted/50 text-left">
                            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Time</th>
                            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Course</th>
                            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Faculty</th>
                            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Room</th>
                            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Section</th>
                            <th className="w-16 px-3 py-2"></th>
                          </tr>
                        </thead>
                        {/* One <tbody> per day present on this page (a single one
                            when a weekday tab is selected), so the day banner's
                            colSpan can't drift from the column count above. */}
                        {DAYS.map((day) => [day, entriesPager.pageItems.filter((e: any) => e.day === day)] as [string, any[]])
                          .filter(([, rows]) => rows.length > 0)
                          .map(([dayLabel, rows]) => (
                          <tbody key={dayLabel}>
                            <tr>
                              <td colSpan={6} className="bg-[#1B4332] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                                {DAY_FULL[dayLabel] ?? dayLabel}
                              </td>
                            </tr>
                            {rows.map((entry: any) => (
                              <tr
                                key={entry.id}
                                className={`border-t border-border transition-colors hover:bg-muted/40 ${canEditEntry(entry) ? "cursor-pointer" : ""}`}
                                onClick={() => { if (canEditEntry(entry)) handleOpenEditEntry(entry.id) }}
                              >
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums">
                                  {entry.startTime}–{entry.endTime}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${entry.subject?.type === "LABORATORY" ? "bg-[#2D6A4F]" : "bg-[#1B4332]"}`} />
                                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                                      {entry.subject?.code}
                                    </span>
                                    {entry.set && (
                                      <span className="rounded bg-[#1B4332]/10 px-1 py-0.5 text-[9px] font-semibold text-[#1B4332]">
                                        Set {entry.set}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 max-w-[240px] truncate text-xs text-muted-foreground" title={entry.subject?.title}>
                                    {entry.subject?.title}
                                  </p>
                                </td>
                                <td className="max-w-[160px] truncate px-3 py-2">
                                  {entry.facultyName ||
                                    `${entry.faculty?.user?.firstName ?? ""} ${entry.faculty?.user?.lastName ?? ""}`.trim() ||
                                    "—"}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{entry.room?.code}</td>
                                <td className="whitespace-nowrap px-3 py-2">
                                  {entrySectionLabel(entry)}
                                  {entry.__mergedSections?.length > 1 && (
                                    <span className="ml-1.5 inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-800" title="One class held for several sections together">
                                      Merged
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {canEditEntry(entry) && (
                                    <div className="flex items-center justify-end gap-0.5">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleOpenEditEntry(entry.id) }}
                                        className="rounded p-1 text-[#1B4332] transition-colors hover:bg-[#1B4332]/10"
                                        title="Edit entry"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setDeleteEntryId(entry.id) }}
                                        className="rounded p-1 text-red-600 transition-colors hover:bg-red-50"
                                        title="Delete entry"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        ))}
                      </table>
                      <PaginationControls
                        page={entriesPager.page}
                        pageCount={entriesPager.pageCount}
                        onPageChange={entriesPager.setPage}
                        total={entriesPager.total}
                        from={entriesPager.from}
                        to={entriesPager.to}
                        label="classes"
                        className="border-t border-border bg-muted/30 px-3 py-2"
                      />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="calendar" className="mt-4 space-y-3">
                  <ScheduleCalendar
                    // Remount on every day change. FullCalendar did not reliably
                    // re-render its columns/events when only `hiddenDays` changed on
                    // a mounted instance — the view stayed blank until the tab was
                    // toggled away and back (which remounted it). A key does that
                    // remount deterministically.
                    key={selectedDay}
                    entries={calendarEntries}
                    visibleDay={showAllDays ? undefined : selectedDay}
                    semesterStartDate={selectedSchedule?.semester?.startDate?.slice(0, 10)}
                    semesterEndDate={selectedSchedule?.semester?.endDate?.slice(0, 10)}
                    onEditEntry={isSuperAdmin || (isAdmin && isDraft) ? (entryId: string) => {
                      // Per-entry check for both roles — mirrors the List view's
                      // canEditEntry so Calendar never opens an edit the API would reject.
                      const entry = entries.find((e: any) => e.id === entryId)
                      if (entry && canEditEntry(entry)) {
                        handleOpenEditEntry(entryId)
                      } else if (isAdmin) {
                        toast.error("You can only edit entries you created. Department Chair entries are read-only.")
                      } else {
                        toast.error("This is another college's major subject — reject the schedule to send it back instead of editing it directly.")
                      }
                    } : undefined}
                    onDeleteEntry={isSuperAdmin || (isAdmin && isDraft) ? (entryId: string) => {
                      const entry = entries.find((e: any) => e.id === entryId)
                      if (entry && canEditEntry(entry)) {
                        setDeleteEntryId(entryId)
                      } else if (isAdmin) {
                        toast.error("You can only delete entries you created. Department Chair entries are read-only.")
                      } else {
                        toast.error("This is another college's major subject — reject the schedule to send it back instead of deleting it directly.")
                      }
                    } : undefined}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* Create Schedule Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateMissing([]) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Department — Dept Chairs create the schedule for each department
                (they plot GEC first, before that department's Program Chair
                opens it). Program Chairs are locked to their own department
                server-side, so the picker is hidden for them. */}
            {isSuperAdmin && (
              <div className="grid gap-2">
                <Label>Department</Label>
                <select
                  value={newDeptId}
                  onChange={(e) => { setNewDeptId(e.target.value); setCreateMissing((m) => m.filter((x) => x !== "department")) }}
                  className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 ${createMissing.includes("department") ? "border-red-500 ring-1 ring-red-500 focus:ring-red-500" : "border-input focus:ring-ring"}`}
                >
                  <option value="">Select department</option>
                  {(allDepartments as any[]).map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.college?.abbreviation ? `${d.college.abbreviation} — ` : ""}{d.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Create the schedule for whichever department you&apos;re plotting GEC/GEL into.
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Semester</Label>
              <select
                value={newSemType}
                onChange={(e) => { setNewSemType(e.target.value); setCreateMissing((m) => m.filter((x) => x !== "semester")) }}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 ${createMissing.includes("semester") ? "border-red-500 ring-1 ring-red-500 focus:ring-red-500" : "border-input focus:ring-ring"}`}
              >
                <option value="">Select semester</option>
                <option value="FIRST">1st Semester</option>
                <option value="SECOND">2nd Semester</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>School Year</Label>
              <Input
                placeholder="e.g. 2025-2026 or 2025 2026"
                value={newSchoolYear}
                onChange={(e) => { setNewSchoolYear(e.target.value); setCreateMissing((m) => m.filter((x) => x !== "schoolYear")) }}
                className={createMissing.includes("schoolYear") ? "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500" : undefined}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => { setNewStartDate(e.target.value); setCreateMissing((m) => m.filter((x) => x !== "startDate")) }}
                  className={createMissing.includes("startDate") ? "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500" : undefined}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => { setNewEndDate(e.target.value); setCreateMissing((m) => m.filter((x) => x !== "endDate")) }}
                  className={createMissing.includes("endDate") ? "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500" : undefined}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Specify when this semester starts and ends (e.g., July 13, 2026 — December 15, 2026).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createSchedule.isPending}>
              {createSchedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Edit Term Dialog — corrects the semester / school year / dates on a DRAFT
          schedule. Without this, a mistyped academic year meant deleting the whole
          schedule and re-entering every entry. */}
      <Dialog open={editTermOpen} onOpenChange={setEditTermOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit schedule term</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Semester</Label>
              <select
                value={termForm.semesterType}
                onChange={(e) => setTermForm((f) => ({ ...f, semesterType: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select semester</option>
                <option value="FIRST">1st Semester</option>
                <option value="SECOND">2nd Semester</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>School Year</Label>
              <Input
                placeholder="e.g. 2025-2026"
                value={termForm.schoolYear}
                onChange={(e) => setTermForm((f) => ({ ...f, schoolYear: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={termForm.startDate}
                  onChange={(e) => setTermForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={termForm.endDate}
                  onChange={(e) => setTermForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
              A semester&apos;s dates are shared by every department scheduling that term — changing
              them here updates the term itself, not just this schedule. Only available while the
              schedule is a draft.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTermOpen(false)}>Cancel</Button>
            <Button
              onClick={handleUpdateTerm}
              disabled={
                updateTerm.isPending ||
                !termForm.semesterType || !termForm.schoolYear || !termForm.startDate || !termForm.endDate
              }
            >
              {updateTerm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Entry Dialog — using native selects to properly display labels */}
      <Dialog
        open={addEntryOpen}
        onOpenChange={(o) => { setAddEntryOpen(o); if (!o) resetEntryForm() }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Schedule Entry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Section first — determines which subjects to show */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Section</Label>
                <div className="relative" ref={sectionComboRef}>
                  <Input
                    placeholder="Search section..."
                    className={`h-10 w-full px-3${missingRing(entryMissing, "section")}`}
                    value={sectionSearch || sections.find((s: any) => s.id === entryForm.sectionId)?.name || ""}
                    onChange={(e) => {
                      setSectionSearch(e.target.value)
                      setSectionDropdownOpen(true)
                      if (!e.target.value) setEntryForm((f) => ({ ...f, sectionId: "", subjectId: "" }))
                    }}
                    onFocus={() => {
                      setSectionDropdownOpen(true)
                      if (entryForm.sectionId) setSectionSearch("")
                    }}
                  />
                  {sectionDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg">
                      {filteredSections.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          {subjectPoolLoading ? "Loading sections…" : "No sections found"}
                        </div>
                      ) : (
                        filteredSections.map((s: any) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setEntryForm((f) => ({ ...f, sectionId: s.id, subjectId: "" }))
                              setSectionSearch("")
                              setSectionDropdownOpen(false)
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                              entryForm.sectionId === s.id ? "bg-accent font-medium" : ""
                            }`}
                          >
                            {s.name}
                            {s.yearLevel?.program?.abbreviation && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({s.yearLevel.program.abbreviation} — Year {s.yearLevel?.level})
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {entryForm.sectionId && selectedSectionForEntry && (
                  <p className="text-[10px] text-muted-foreground">
                    {selectedSectionForEntry.yearLevel?.program?.abbreviation} — Year {selectedSectionForEntry.yearLevel?.level} ({scheduleSemesterType === "FIRST" ? "1st" : "2nd"} Semester)
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Subject</Label>
                <select
                  value={entryForm.subjectId}
                  onChange={(e) => {
                    const subjectId = e.target.value
                    const picked = (subjects as any[]).find((s: any) => s.id === subjectId)
                    // PATHFIT defaults: venue = GYM, faculty = TBA (same as auto-generation).
                    const pathfitDefaults = picked && isPathfitCode(picked.code)
                      ? (() => {
                          const gym = (departmentRooms as any[]).find((r: any) => r.code === GYM_ROOM_CODE)
                          const tba = (facultyList as any[]).find((f: any) => isTbaFacultyEmployeeId(f.employeeId))
                          return {
                            ...(gym ? { roomId: gym.id } : {}),
                            ...(tba ? { facultyId: tba.id, facultyName: PATHFIT_FACULTY_LABEL } : {}),
                          }
                        })()
                      : {}
                    setEntryForm((f) => ({ ...f, subjectId, set: "", ...pathfitDefaults }))
                    if ("facultyId" in pathfitDefaults) setFacultySearch("")
                    setSplitLabSets(false)
                    setEntryMissing((m) => m.filter((x) => x !== "subject"))
                  }}
                  className={`w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring${missingRing(entryMissing, "subject")}`}
                >
                  <option value="">{subjectPoolLoading ? "Loading subjects…" : "Select subject"}</option>
                  {filteredSubjects.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.title}</option>
                  ))}
                </select>
                {entryForm.sectionId && selectedSectionForEntry && (
                  <p className="text-[10px] text-muted-foreground">
                    Showing subjects for {selectedSectionForEntry.yearLevel?.program?.abbreviation} Year {selectedSectionForEntry.yearLevel?.level}
                  </p>
                )}
              </div>
            </div>
            {/* Set (A/B) — only for LABORATORY subjects */}
            {selectedSubjectForEntry?.type === "LABORATORY" && (
              <div className="space-y-3">
                {/* Only offered when creating a lab from scratch — once either half
                    exists, the single Set picker below (unaffected by this toggle)
                    is how the remaining one gets added. */}
                {placedSetsForEntry.size === 0 && (
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input bg-muted/30 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4 text-[#1B4332]" />
                      Split into lab sets
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={splitLabSets}
                      onClick={() => setSplitLabSets((v) => !v)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                        splitLabSets ? "bg-[#1B4332]" : "bg-input"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          splitLabSets ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </label>
                )}
                {splitLabSets ? (
                  <p className="text-[10px] text-muted-foreground">
                    Set A and Set B will both be created from this one form — each with its own Room, Day and Time below.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    <Label>Set</Label>
                    <select
                      value={entryForm.set}
                      onChange={(e) => setEntryForm((f) => ({ ...f, set: e.target.value as "" | "A" | "B" }))}
                      className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select set</option>
                      <option value="A" disabled={placedSetsForEntry.has("A")}>
                        Set A (first half — ~20 students){placedSetsForEntry.has("A") ? " — already scheduled" : ""}
                      </option>
                      <option value="B" disabled={placedSetsForEntry.has("B")}>
                        Set B (second half — ~20 students){placedSetsForEntry.has("B") ? " — already scheduled" : ""}
                      </option>
                    </select>
                    <p className="text-[10px] text-muted-foreground">
                      Lab subjects are split into two sets. Set A and Set B can overlap in time since they are different student groups.
                      {placedSetsForEntry.size === 1 && " The remaining set is pre-selected for you."}
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* Merged NSTP sections — an NSTP class routinely combines two or
                more sections into one class (same faculty, room, day and time).
                Pick the extra sections here; each gets its own row sharing a
                mergeGroupId, and the views show them as one line. NSTP only. */}
            {entryForm.sectionId && selectedSubjectForEntry && isNstpCode(selectedSubjectForEntry.code) && (
              <div className="grid gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-[#1B4332]" />
                    Merge with other sections
                    <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
                  </span>
                  {mergeSectionIds.length > 0 && (
                    <button type="button" onClick={() => setMergeSectionIds([])} className="text-[10px] text-muted-foreground underline underline-offset-2">
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {mergeCandidateSections.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground">No other sections available in this department.</p>
                  ) : mergeCandidateSections.map((s: any) => {
                    const checked = mergeSectionIds.includes(s.id)
                    return (
                      <label
                        key={s.id}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          checked ? "bg-[#1B4332]/10 border-[#1B4332] text-[#1B4332]" : "border-input text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setMergeSectionIds((prev) => checked ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                          className="rounded border-input"
                        />
                        {s.name}
                        {s.yearLevel?.program?.abbreviation && (
                          <span className="text-[10px] font-normal text-muted-foreground">({s.yearLevel.program.abbreviation} Y{s.yearLevel?.level})</span>
                        )}
                      </label>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {mergeSectionIds.length > 0
                    ? `One class for ${mergeSectionIds.length + 1} sections — ${[selectedSectionForEntry?.name, ...mergeSectionIds.map((id) => sections.find((x: any) => x.id === id)?.name)].filter(Boolean).join(" + ")}. Each section's timetable is checked; the shared room and faculty count once.`
                    : "Sections that take this NSTP class together, in the same room at the same time."}
                </p>
              </div>
            )}
            {/* Faculty (text autocomplete) & Room (department-restricted). Room drops
                out of this row in split mode — it moves into the Set A/Set B cards
                below instead, since each set can use a different room. */}
            <div className={splitLabSets ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
              {/* ── Faculty — free-text with autocomplete suggestions ────────
                  The user types a name; matching faculty appear as suggestions.
                  Selecting one fills both the display name and the internal facultyId.
                  If typed name doesn't match any faculty, it is saved as facultyName
                  override so it still appears correctly in the schedule.
              ──────────────────────────────────────────────────────────────── */}
              <div className="grid gap-2">
                <Label>Faculty</Label>
                <div className="relative" ref={facultyComboRef}>
                  <Input
                    placeholder="Type faculty name..."
                    className={`h-10 w-full px-3${missingRing(entryMissing, "faculty")}`}
                    value={
                      facultySearch ||
                      entryForm.facultyName ||
                      (entryForm.facultyId
                        ? (() => {
                            const f = facultyList.find((f: any) => f.id === entryForm.facultyId)
                            return f ? `${f.user?.firstName} ${f.user?.lastName}` : ""
                          })()
                        : "")
                    }
                    onChange={(e) => {
                      const val = e.target.value
                      setFacultySearch(val)
                      setFacultyDropdownOpen(true)
                      // Clear the ID so we don't use a stale FK while typing
                      setEntryForm((f) => ({
                        ...f,
                        facultyId: "",
                        facultyName: val, // always store typed value
                        day: "",
                        startTime: "",
                        endTime: "",
                      }))
                    }}
                    onFocus={() => {
                      setFacultyDropdownOpen(true)
                      // When field is focused again, show the raw search
                      if (entryForm.facultyId) {
                        const f = facultyList.find((fac: any) => fac.id === entryForm.facultyId)
                        setFacultySearch(f ? `${f.user?.firstName} ${f.user?.lastName}` : "")
                      }
                    }}
                  />
                  {facultyDropdownOpen && (facultySearch || !entryForm.facultyId) && (
                    <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border bg-popover shadow-lg">
                      {/* Option to keep the typed text as-is (no DB match required) */}
                      {facultySearch && (
                        <button
                          key="__typed"
                          type="button"
                          onClick={() => {
                            setEntryForm((f) => ({ ...f, facultyId: "", facultyName: facultySearch }))
                            setFacultySearch("")
                            setFacultyDropdownOpen(false)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent border-b"
                        >
                          <span className="text-muted-foreground text-xs">Use as typed:</span>
                          <span className="font-medium truncate">{facultySearch}</span>
                        </button>
                      )}
                      {/* Filtered faculty list */}
                      {filteredFaculty
                        .filter((f: any) => {
                          if (!facultySearch) return true
                          const full = `${f.user?.firstName} ${f.user?.lastName}`.toLowerCase()
                          return full.includes(facultySearch.toLowerCase())
                        })
                        .map((f: any) => {
                          const full = `${f.user?.firstName} ${f.user?.lastName}`
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                setEntryForm((fv) => ({
                                  ...fv,
                                  facultyId: f.id,
                                  facultyName: full,
                                  day: "",
                                  startTime: "",
                                  endTime: "",
                                }))
                                setFacultySearch("")
                                setFacultyDropdownOpen(false)
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                                entryForm.facultyId === f.id ? "bg-accent font-medium" : ""
                              }`}
                            >
                              <span className="font-medium">{full}</span>
                              {f.specializations?.length > 0 && (
                                <span className="ml-2 text-[11px] text-muted-foreground">
                                  {f.specializations.slice(0, 2).join(", ")}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      {filteredFaculty.filter((f: any) => {
                        if (!facultySearch) return true
                        const full = `${f.user?.firstName} ${f.user?.lastName}`.toLowerCase()
                        return full.includes(facultySearch.toLowerCase())
                      }).length === 0 && !facultySearch && (
                        <div className="px-3 py-2.5 text-xs text-muted-foreground">
                          {facultyPoolLoading ? (
                            <p className="animate-pulse">Loading faculty…</p>
                          ) : selectedSubjectForEntry ? (
                            <>
                              <p className="font-medium text-amber-700">
                                No faculty specializes in &ldquo;{selectedSubjectForEntry.title}&rdquo;
                              </p>
                              <p className="mt-1">
                                Saving is blocked without a specialization match, so this list only shows
                                who can actually be assigned. Open the <strong>Faculty</strong> page and add
                                this subject to the right instructor&apos;s specializations, or type a name
                                above to record it as free text.
                              </p>
                              <p className="mt-1.5 text-[10px] text-muted-foreground/70">
                                Searched {facultyList.length} faculty record{facultyList.length === 1 ? "" : "s"} you
                                have access to.
                              </p>
                            </>
                          ) : (
                            <p>No faculty found.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {entryForm.facultyId && (
                  <p className="text-[10px] text-emerald-600">✓ Linked to faculty record (availability & conflicts checked)</p>
                )}
                {!entryForm.facultyId && entryForm.facultyName && (
                  <p className="text-[10px] text-amber-600">⚠ Free-text name — not linked to a faculty record</p>
                )}
              </div>

              {/* ── Room — filtered to department-assigned buildings. Hidden in split
                  mode; Set A/Set B each get their own Room field below instead. ── */}
              {!splitLabSets && (
                <div className="grid gap-2">
                  <Label>Room</Label>
                  <select
                    value={entryForm.roomId}
                    onChange={(e) => setEntryForm((f) => ({ ...f, roomId: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select room</option>
                    {filteredRooms.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.code} ({r.name}) — {r.building?.code ?? ""} · {r.type?.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  {scheduleDeptId && departmentRooms.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Showing {departmentRooms.length} room{departmentRooms.length !== 1 ? "s" : ""} in your department's buildings
                    </p>
                  )}
                  {entryForm.subjectId && selectedSubjectForEntry?.requiredRoomType?.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Filtered by subject type: {selectedSubjectForEntry.requiredRoomType.map((t: string) => t.replace(/_/g, " ")).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
            {/* Day-pattern + Start/End Time — the single-entry path. Replaced
                entirely by the Set A/Set B panels below when splitLabSets is on,
                since each set needs its own Day and Time rather than one shared
                pair. */}
            {!splitLabSets && (
            <>
            <div className="grid gap-2">
              <Label>Day{patternDays.length > 1 ? "s" : ""}</Label>
              {/* Pattern picker: Single Day keeps the classic one-day dropdown;
                  MWF/TTh are one-click presets; Custom lets any combination of
                  days be checked. All three multi-day modes create one entry
                  per day sharing a groupId (list/calendar collapse them, and
                  delete removes the whole set together — same as auto-gen). */}
              <div className="flex flex-wrap gap-1.5">
                {(["single", "MWF", "TTH", "custom"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setDayPattern(p); setEntryForm((f) => ({ ...f, day: "", startTime: "", endTime: "" })) }}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      dayPattern === p
                        ? "bg-[#1B4332] text-white border-[#1B4332]"
                        : "bg-background text-muted-foreground border-input hover:bg-muted"
                    }`}
                  >
                    {p === "single" ? "Single Day" : p === "MWF" ? "MWF" : p === "TTH" ? "TTh" : "Custom"}
                  </button>
                ))}
              </div>

              {dayPattern === "single" && (
                <select
                  value={entryForm.day}
                  onChange={(e) => setEntryForm((f) => ({ ...f, day: e.target.value, startTime: "", endTime: "" }))}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select day</option>
                  {availableDays.map((d) => (
                    <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              )}

              {(dayPattern === "MWF" || dayPattern === "TTH") && (
                <div className="flex flex-wrap gap-1.5">
                  {patternDays.map((d) => (
                    <span key={d} className="inline-flex items-center rounded-md bg-[#1B4332]/10 px-2 py-1 text-xs font-medium text-[#1B4332]">
                      {d.charAt(0) + d.slice(1).toLowerCase()}
                    </span>
                  ))}
                </div>
              )}

              {dayPattern === "custom" && (
                <div className="flex flex-wrap gap-1.5">
                  {availableDays.map((d) => {
                    const checked = customDays.includes(d)
                    return (
                      <label
                        key={d}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          checked ? "bg-[#1B4332]/10 border-[#1B4332] text-[#1B4332]" : "border-input text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setCustomDays((prev) => checked ? prev.filter((x) => x !== d) : [...prev, d])
                            setEntryForm((f) => ({ ...f, startTime: "", endTime: "" }))
                          }}
                          className="rounded border-input"
                        />
                        {d.charAt(0) + d.slice(1).toLowerCase()}
                      </label>
                    )
                  })}
                </div>
              )}

              {entryForm.facultyId && dayPattern === "single" && availableDays.length < DAYS.length && (
                <p className="text-[10px] text-muted-foreground">Showing days based on faculty availability</p>
              )}
              {entryForm.facultyId && facultyAvailability.length === 0 && (
                <p className="text-[10px] text-amber-600">No availability set for this faculty — they cannot be scheduled until availability is added in Faculty Availability.</p>
              )}
              {patternDays.length > 1 && (
                <p className="text-[10px] text-muted-foreground">Same time on every day below — creates {patternDays.length} linked entries.</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Time</Label>
                <select
                  value={entryForm.startTime}
                  onChange={(e) => setEntryForm((f) => ({ ...f, startTime: e.target.value, endTime: "" }))}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select time</option>
                  {constraintFilteredStartTimes.map(({ time, available, reasons }) => (
                    <option key={time} value={time} disabled={!available} className={!available ? "text-red-400" : ""}>
                      {time}{!available ? ` ✗ ${reasons.join(", ")}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>End Time</Label>
                <select
                  value={entryForm.endTime}
                  onChange={(e) => setEntryForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select time</option>
                  {constraintFilteredEndTimes.map(({ time }) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Time-field hints — kept in one shared block below both selects
                (rather than per-column) so Start Time and End Time always stay
                aligned in the same row, regardless of which hints are active. */}
            {(
              (entryForm.facultyId && entryForm.day && availableTimeOptions.length < TIME_OPTIONS.length) ||
              (entryForm.day && (occupiedSlots.faculty.length > 0 || occupiedSlots.room.length > 0 || occupiedSlots.section.length > 0)) ||
              (entryForm.startTime && constraintFilteredEndTimes.length > 0) ||
              (entryForm.startTime && selectedSubjectForEntry && resolveMaxMinutesPerDay(selectedSubjectForEntry) !== null)
            ) && (
              <div className="-mt-2 space-y-0.5">
                {entryForm.facultyId && entryForm.day && availableTimeOptions.length < TIME_OPTIONS.length && (
                  <p className="text-[10px] text-muted-foreground">Filtered by faculty availability</p>
                )}
                {entryForm.day && (occupiedSlots.faculty.length > 0 || occupiedSlots.room.length > 0 || occupiedSlots.section.length > 0) && (
                  <p className="text-[10px] text-amber-600">Conflicting times disabled</p>
                )}
                {entryForm.startTime && constraintFilteredEndTimes.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">Showing valid end times (no conflicts)</p>
                )}
                {entryForm.startTime && selectedSubjectForEntry && resolveMaxMinutesPerDay(selectedSubjectForEntry) !== null && (
                  <p className="text-[10px] text-sky-700">
                    {selectedSubjectForEntry.code} is limited to {formatMinutes(resolveMaxMinutesPerDay(selectedSubjectForEntry)!)} per day — use MWF / TTh to spread the hours.
                  </p>
                )}
              </div>
            )}
            </>
            )}

            {/* Split-lab-sets path: Set A and Set B side by side, each with its own
                Room/Day/Time — mirrors the shared single-entry fields above but
                doubled, since both halves are created from this one submission. */}
            {splitLabSets && (
              <div className="grid gap-2">
                <Label>Set A &amp; Set B</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { label: "A", sub: "~20 students", value: setAEntry, setValue: setSetAEntry },
                    { label: "B", sub: "~20 students", value: setBEntry, setValue: setSetBEntry },
                  ] as const).map(({ label, sub, value, setValue }) => {
                    const timeOptions = timeOptionsForDay(value.day)
                    return (
                      <div key={label} className="rounded-lg border border-input p-3 space-y-2.5">
                        <p className="text-xs font-semibold text-[#1B4332]">Set {label} — {sub}</p>
                        <div className="grid gap-1.5">
                          <Label className="text-xs text-muted-foreground">Room</Label>
                          <select
                            value={value.roomId}
                            onChange={(e) => setValue((v) => ({ ...v, roomId: e.target.value }))}
                            className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Select room</option>
                            {filteredRooms.map((r: any) => (
                              <option key={r.id} value={r.id}>
                                {r.code} ({r.name}){r.building?.code ? ` — ${r.building.code}` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs text-muted-foreground">Day</Label>
                          <select
                            value={value.day}
                            onChange={(e) => setValue((v) => ({ ...v, day: e.target.value, startTime: "", endTime: "" }))}
                            className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Select day</option>
                            {availableDays.map((d) => (
                              <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-muted-foreground">Start</Label>
                            <select
                              value={value.startTime}
                              onChange={(e) => setValue((v) => ({ ...v, startTime: e.target.value, endTime: "" }))}
                              className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="">--</option>
                              {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-muted-foreground">End</Label>
                            <select
                              value={value.endTime}
                              onChange={(e) => setValue((v) => ({ ...v, endTime: e.target.value }))}
                              className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="">--</option>
                              {timeOptions.filter((t) => !value.startTime || t > value.startTime).map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {entryForm.facultyId && facultyAvailability.length === 0 && (
                  <p className="text-[10px] text-amber-600">No availability set for this faculty — they cannot be scheduled until availability is added in Faculty Availability.</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Room/day/time conflicts are checked when you save. Set A and Set B may share the same day and time since they are different student groups.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddEntryOpen(false); resetEntryForm() }}>Cancel</Button>
            <Button onClick={handleAddEntry} disabled={createEntry.isPending}>
              {createEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Entry Dialog ── */}
      <Dialog open={editEntryOpen} onOpenChange={setEditEntryOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-base font-semibold tracking-tight">Edit Schedule Entry</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Update the details for this scheduled class.</p>
          </DialogHeader>

          <div className="space-y-5 py-4">

            {/* Row 1: Faculty | Subject */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">Faculty</Label>
                <select
                  value={editEntryForm.facultyId}
                  onChange={(e) => { setEditEntryForm((f) => ({ ...f, facultyId: e.target.value, day: "", startTime: "", endTime: "" })); setEditMissing((m) => m.filter((x) => x !== "faculty")) }}
                  className={`w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring${missingRing(editMissing, "faculty")}`}
                >
                  <option value="">{facultyPoolLoading ? "Loading faculty…" : "— Select faculty —"}</option>
                  {editFilteredFaculty.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.user?.firstName} {f.user?.lastName}</option>
                  ))}
                </select>
                {editEntryForm.subjectId && !editEntryForm.facultyId && !facultyPoolLoading && (
                  <p className="text-[10px] text-muted-foreground">Filtered by subject specialization</p>
                )}
                {editEntryForm.subjectId && editFilteredFaculty.length === 0 && !facultyPoolLoading && (
                  <p className="text-[10px] text-destructive">
                    No faculty specializes in this subject ({facultyList.length} record
                    {facultyList.length === 1 ? "" : "s"} searched).
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">Subject</Label>
                <select
                  value={editEntryForm.subjectId}
                  onChange={(e) => {
                    setEditEntryForm((f) => ({ ...f, subjectId: e.target.value, sectionId: "", set: "" }))
                    setEditMissing((m) => m.filter((x) => x !== "subject"))
                    setEditSectionSearch("")
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{subjectPoolLoading ? "Loading subjects…" : "— Select subject —"}</option>
                  {editFilteredSubjects.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.title}</option>
                  ))}
                </select>
                {editFilteredSubjects.length === 0 && editEntryForm.facultyId && !subjectPoolLoading && (
                  <p className="text-[10px] text-destructive">No subjects match this faculty&apos;s specialization.</p>
                )}
              </div>
            </div>

            {/* Row 2: Section | Room */}
            <div className="grid grid-cols-2 gap-4">
              {isNstpCode(editSelectedSubject?.code) ? (
                /* NSTP: the class may cover several sections (merged). Chips for
                   the current list, a picker to add one; removing the last-but-one
                   turns it back into an ordinary single-section class. */
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">
                    Sections {editMergeSectionIds.length > 1 && <span className="ml-1 rounded bg-[#1B4332]/10 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-[#1B4332]">Merged · {editMergeSectionIds.length}</span>}
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {editMergeSectionIds.map((sid) => {
                      const sec = sections.find((x: any) => x.id === sid)
                      return (
                        <span key={sid} className="inline-flex items-center gap-1 rounded-md bg-[#1B4332]/10 px-2 py-1 text-xs font-medium text-[#1B4332]">
                          {sec?.name ?? "Section"}
                          {editMergeSectionIds.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setEditMergeSectionIds((prev) => prev.filter((x) => x !== sid))}
                              className="rounded p-0.5 hover:bg-[#1B4332]/20"
                              title="Remove this section from the class"
                              aria-label={`Remove ${sec?.name ?? "section"}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      )
                    })}
                  </div>
                  <select
                    value={editMergeAddId}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v) setEditMergeSectionIds((prev) => prev.includes(v) ? prev : [...prev, v])
                      setEditMergeAddId("")
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">+ Merge another section…</option>
                    {editMergeCandidates.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.yearLevel?.program?.abbreviation ? ` (${s.yearLevel.program.abbreviation} Y${s.yearLevel?.level})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    {editMergeSectionIds.length > 1
                      ? "One NSTP class for all of these sections — same faculty, room and time. Changes below apply to every section."
                      : "Add sections to merge them into this NSTP class."}
                  </p>
                </div>
              ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">Section</Label>
                <div className="relative" ref={editSectionComboRef}>
                  <Input
                    placeholder="Search section..."
                    className={`h-9 w-full text-sm${missingRing(editMissing, "section")}`}
                    value={editSectionSearch || sections.find((s: any) => s.id === editEntryForm.sectionId)?.name || ""}
                    onChange={(e) => {
                      setEditSectionSearch(e.target.value)
                      setEditSectionDropdownOpen(true)
                      if (!e.target.value) setEditEntryForm((f) => ({ ...f, sectionId: "" }))
                    }}
                    onFocus={() => {
                      setEditSectionDropdownOpen(true)
                      if (editEntryForm.sectionId) setEditSectionSearch("")
                    }}
                  />
                  {editSectionDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-44 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {editSectionOptions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-destructive">No matching sections found.</div>
                      ) : (
                        editSectionOptions.map((s: any) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setEditEntryForm((f) => ({ ...f, sectionId: s.id }))
                              setEditSectionSearch("")
                              setEditSectionDropdownOpen(false)
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                              editEntryForm.sectionId === s.id ? "bg-accent font-medium" : ""
                            }`}
                          >
                            {s.name}
                            {s.yearLevel?.level && (
                              <span className="ml-1.5 text-[10px] text-muted-foreground">Year {s.yearLevel.level}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {editEntryForm.subjectId && editSelectedSubject?.year && (
                  <p className="text-[10px] text-muted-foreground">Year {editSelectedSubject.year} sections</p>
                )}
              </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">Room</Label>
                <select
                  value={editEntryForm.roomId}
                  onChange={(e) => setEditEntryForm((f) => ({ ...f, roomId: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select room —</option>
                  {editRoomOptions.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.code} ({r.name}) — {r.type?.replace(/_/g, " ")}</option>
                  ))}
                </select>
                {editEntryForm.subjectId && editSelectedSubject?.requiredRoomType?.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">Filtered: {editSelectedSubject.requiredRoomType.map((t: string) => t.replace(/_/g, " ")).join(", ")}</p>
                )}
              </div>
            </div>

            {/* Row 3: Set — only for LABORATORY subjects */}
            {editSelectedSubject?.type === "LABORATORY" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">Laboratory Set</Label>
                <select
                  value={editEntryForm.set}
                  onChange={(e) => setEditEntryForm((f) => ({ ...f, set: e.target.value as "" | "A" | "B" }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select set —</option>
                  <option value="A">Set A — First half (~20 students)</option>
                  <option value="B">Set B — Second half (~20 students)</option>
                </select>
                <p className="text-[10px] text-muted-foreground">Set A and Set B may share the same time slot as they are separate student groups.</p>
              </div>
            )}

            {/* Divider */}
            <div className="border-t" />

            {/* Row 4: Day */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">Day of Week</Label>
              <select
                value={editEntryForm.day}
                onChange={(e) => setEditEntryForm((f) => ({ ...f, day: e.target.value, startTime: "", endTime: "" }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select day —</option>
                {editAvailableDays.map((d) => (
                  <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
                ))}
              </select>
              {editEntryForm.facultyId && editFacultyAvailability.length === 0 && (
                <p className="text-[10px] text-amber-600">No availability set for this faculty — they cannot be scheduled until availability is added in Faculty Availability.</p>
              )}
              {editEntryForm.facultyId && editFacultyAvailability.length > 0 && (
                <p className="text-[10px] text-muted-foreground">Days filtered by faculty availability</p>
              )}
            </div>

            {/* Row 5: Start Time | End Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">Start Time</Label>
                <select
                  value={editEntryForm.startTime}
                  onChange={(e) => setEditEntryForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select time —</option>
                  {editAvailableTimeOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {editEntryForm.facultyId && editEntryForm.day && editAvailableTimeOptions.length < TIME_OPTIONS.length && (
                  <p className="text-[10px] text-muted-foreground">Filtered by faculty availability</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">End Time</Label>
                <select
                  value={editEntryForm.endTime}
                  onChange={(e) => setEditEntryForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select time —</option>
                  {editAvailableTimeOptions.filter((t) => {
                    if (!editEntryForm.startTime) return true
                    if (t <= editEntryForm.startTime) return false
                    const cap = editSelectedSubject ? resolveMaxMinutesPerDay(editSelectedSubject) : null
                    if (cap === null) return true
                    return toMinsHelper(t) - toMinsHelper(editEntryForm.startTime) <= cap
                  }).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {editEntryForm.startTime && editSelectedSubject && resolveMaxMinutesPerDay(editSelectedSubject) !== null && (
                  <p className="text-[10px] text-sky-700">
                    Limited to {formatMinutes(resolveMaxMinutesPerDay(editSelectedSubject)!)} per day.
                  </p>
                )}
              </div>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntryOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateEntry} disabled={updateEntry.isPending} className="bg-[#1B4332] hover:bg-[#2D6A4F]">
              {updateEntry.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Conflict Override Dialog (soft-validation) ── */}
      <Dialog
        open={!!conflictMessage}
        onOpenChange={() => { setConflictMessage(null); setPendingForceChanges(null); setForceEntryId(null); setPendingForceCreate(null) }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Scheduling Conflict Detected
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground leading-relaxed">{conflictMessage}</p>
            <p className="text-sm font-medium">Save anyway?</p>
            <p className="text-xs text-muted-foreground">
              The conflict will be listed under Conflicts so you can fix it later by adjusting
              the affected entries.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setConflictMessage(null); setPendingForceChanges(null); setForceEntryId(null); setPendingForceCreate(null) }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleForceOverride}
              disabled={updateEntry.isPending}
            >
              {updateEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generate Schedule Dialog ── */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Automatically builds the timetable from your faculty availability, subject data, and rooms.
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  {userRole === "PATHFIT"
                    ? "Places a PATHFit class for every section of this department — one continuous block in the GYM, faculty TBA. Existing PATHFit entries in this schedule will be replaced; nothing else is touched."
                    : isSuperAdmin
                    ? "Places the general education subjects under your area. PATHFit is generated by the PATHFit Director and NSTP is added by hand by the NSTP Director. Existing entries for your subjects will be replaced."
                    : "Places your program's major subjects. Check that faculty availability and subject data are up to date. When your classes are complete, mark your subjects as done — the schedule goes to the Dean once every Program Chairperson is done. Regenerating reopens your done mark."}
                </p>
              </div>
            </div>
            {generateError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
                <p className="text-sm font-medium text-red-800">{generateError.message}</p>
                {generateError.details.length > 0 && (
                  <>
                    {generateError.details.length <= 5 ? (
                      <ul className="list-disc pl-4 text-xs text-red-700 space-y-0.5">
                        {generateError.details.map((d: string, i: number) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-red-700 space-y-1">
                        <p className="font-medium">{generateError.details.length} issues found:</p>
                        {/* Group by common patterns */}
                        {(() => {
                          const specIssues = generateError.details.filter(d => d.includes("No faculty specializations match"))
                          const roomIssues = generateError.details.filter(d => d.includes("No compatible rooms"))
                          const availIssues = generateError.details.filter(d => d.includes("availability"))
                          const otherIssues = generateError.details.filter(d =>
                            !d.includes("No faculty specializations match") &&
                            !d.includes("No compatible rooms") &&
                            !d.includes("availability")
                          )
                          return (
                            <ul className="list-disc pl-4 space-y-0.5">
                              {specIssues.length > 0 && (
                                <li><strong>{specIssues.length} subjects</strong> have no faculty with matching specializations. Go to <strong>Faculty</strong> and update their specializations to match the current subjects.</li>
                              )}
                              {roomIssues.length > 0 && (
                                <li><strong>{roomIssues.length} subjects</strong> have no compatible rooms. Check room types in <strong>Buildings / Rooms</strong>.</li>
                              )}
                              {availIssues.length > 0 && (
                                <li>{availIssues.length > 1 ? `${availIssues.length} issues` : availIssues[0]} related to faculty availability. Set availability in <strong>Faculty Availability</strong>.</li>
                              )}
                              {otherIssues.map((d, i) => (
                                <li key={i}>{d}</li>
                              ))}
                            </ul>
                          )
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={generateSchedule.isPending}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generateSchedule.isPending} className="bg-[#1B4332] hover:bg-[#2D6A4F]">
              {generateSchedule.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</>
              ) : (
                <><Cpu className="mr-2 h-4 w-4" />Generate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generation loading overlay ──────────────────────────────────────────
          Covers the page while the backtracking engine runs. It is deliberately
          blocking: entries are cleared and rewritten server-side, so clicking
          around mid-run would show a half-written schedule. */}
      {generateSchedule.isPending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="mx-4 flex max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-lg">
            <div className="relative">
              <Loader2 className="h-10 w-10 animate-spin text-[#1B4332]" />
              <Cpu className="absolute inset-0 m-auto h-4 w-4 text-[#1B4332]" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Generating…</p>
              <p className="text-sm text-muted-foreground">
                Building the timetable from your subjects, faculty availability and rooms.
                This can take up to a minute — please keep this tab open.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Pre-Publish Validation Dialog ── */}
      <Dialog open={publishValidationOpen} onOpenChange={setPublishValidationOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {publishValidation.loading ? (
                <><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />Checking…</>
              ) : publishValidation.errors.length === 0 ? (
                <><CheckCircle2 className="h-5 w-5 text-green-600" />Ready to Publish</>
              ) : (
                <><AlertTriangle className="h-5 w-5 text-red-600" />Issues Found</>
              )}
            </DialogTitle>
          </DialogHeader>

          {publishValidation.loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Checking {entries.length} entries for conflicts…</span>
            </div>
          ) : (
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              {/* Summary */}
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold">{publishValidation.entryCount}</p>
                    <p className="text-[10px] text-muted-foreground">Total Entries</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${publishValidation.errors.length > 0 ? "text-red-600" : "text-green-600"}`}>
                      {publishValidation.errors.length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Errors</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${publishValidation.warnings.length > 0 ? "text-amber-600" : "text-green-600"}`}>
                      {publishValidation.warnings.length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Warnings</p>
                  </div>
                </div>
              </div>

              {/* Errors */}
              {publishValidation.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-red-800 uppercase tracking-wide flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Blocking Errors — Must resolve before publishing
                  </p>
                  <ul className="list-disc pl-4 text-xs text-red-700 space-y-1">
                    {publishValidation.errors.map((err, i) => (
                      <li key={i}>{err.description}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {publishValidation.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Warnings — Review before publishing
                  </p>
                  <ul className="list-disc pl-4 text-xs text-amber-700 space-y-1">
                    {publishValidation.warnings.map((warn, i) => (
                      <li key={i}>{warn.description}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* All clear */}
              {publishValidation.errors.length === 0 && publishValidation.warnings.length === 0 && publishValidation.entryCount > 0 && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">No conflicts found.</p>
                      <p className="text-xs text-green-700 mt-0.5">
                        No faculty overlaps, room conflicts, section conflicts, or load violations detected.
                        The schedule is ready to be published.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishValidationOpen(false)}>
              {publishValidation.errors.length > 0 ? "Close & Fix Issues" : "Cancel"}
            </Button>
            {publishValidation.errors.length === 0 && publishValidation.entryCount > 0 && !publishValidation.loading && (
              <Button
                onClick={handlePublish}
                disabled={publishSchedule.isPending}
                className="bg-[#1B4332] hover:bg-[#2D6A4F]"
              >
                {publishSchedule.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing…</>
                ) : (
                  <><Globe className="mr-2 h-4 w-4" />Confirm & Publish</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Delete Schedule Confirmation Dialog ─────────────────────────────── */}
      <Dialog open={deleteConfirmOpen} onOpenChange={(open) => { if (!deleteSchedule.isPending) setDeleteConfirmOpen(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-4 w-4 text-red-600" />
              </div>
              Delete Schedule?
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Schedule identity */}
            {selectedSchedule && (
              <div className="rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">
                  {selectedSchedule.semester?.type === "FIRST"
                    ? "1st Semester"
                    : selectedSchedule.semester?.type === "SECOND"
                    ? "2nd Semester"
                    : "Summer"}{" "}
                  {selectedSchedule.semester?.academicYear?.label}
                </p>
                {selectedSchedule.department && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedSchedule.department.name ?? selectedSchedule.department.abbreviation}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedSchedule.entries?.length ?? 0} entries will be permanently removed
                </p>
              </div>
            )}

            {/* Warning */}
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <p className="text-xs text-red-700">
                This action <strong>cannot be undone</strong>. The schedule and all its entries will be permanently deleted.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteSchedule.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
              disabled={deleteSchedule.isPending}
              onClick={() => {
                if (!selectedScheduleId) return
                deleteSchedule.mutate(selectedScheduleId, {
                  onSuccess: () => {
                    setDeleteConfirmOpen(false)
                    setSelectedScheduleId(null)
                    toast.success("Schedule deleted successfully")
                  },
                  onError: (err: any) => {
                    toast.error(err.message)
                  },
                })
              }}
            >
              {deleteSchedule.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Entry Confirmation Dialog ─────────────────────────────────── */}
      <Dialog open={!!deleteEntryId} onOpenChange={(open) => { if (!deleteEntry.isPending && !open) setDeleteEntryId(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-4 w-4 text-red-600" />
              </div>
              Delete Entry?
            </DialogTitle>
          </DialogHeader>

          {(() => {
            const entryToDelete = entries.find((e: any) => e.id === deleteEntryId)
            if (!entryToDelete) return null
            // Multi-day (MWF/TTh) entries share a groupId — the DELETE route removes
            // every sibling row in one call, so warn the chair all sessions go together.
            const groupSiblings = entryToDelete.mergeGroupId
              ? entries.filter((e: any) => e.mergeGroupId === entryToDelete.mergeGroupId)
              : entryToDelete.groupId
                ? entries.filter((e: any) => e.groupId === entryToDelete.groupId)
                : [entryToDelete]
            const isGrouped = groupSiblings.length > 1
            const mergedNames = entryToDelete.mergeGroupId
              ? [...new Set(groupSiblings.map((e: any) => e.section?.name).filter(Boolean))] as string[]
              : []
            // Distinct days — a merged class has one row per section per day.
            const groupDayLabel = [...new Set(groupSiblings.map((e: any) => e.day as string))]
              .sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))
              .map((d) => DAY_LABELS[d] ?? d)
              .join("/")
            return (
              <div className="space-y-4 py-1">
                <div className="rounded-lg border bg-muted/40 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">
                    {entryToDelete.subject?.code} — {entryToDelete.subject?.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {mergedNames.length > 1 ? mergedNames.join(" + ") : entryToDelete.section?.name}
                    {entryToDelete.faculty?.user && ` · ${entryToDelete.faculty.user.firstName} ${entryToDelete.faculty.user.lastName}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isGrouped
                      ? groupDayLabel
                      : entryToDelete.day?.charAt(0) + entryToDelete.day?.slice(1).toLowerCase()}
                    ,{" "}
                    {entryToDelete.startTime} – {entryToDelete.endTime}
                  </p>
                </div>
                <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                  <p className="text-xs text-red-700">
                    {mergedNames.length > 1 ? (
                      <>Deletes this <strong>merged NSTP class for all {mergedNames.length} sections</strong> ({mergedNames.join(", ")}{groupSiblings.length > mergedNames.length ? `, ${groupDayLabel}` : ""}). To drop one section only, edit the class instead. This action <strong>cannot be undone</strong>.</>
                    ) : isGrouped ? (
                      <>Deletes <strong>all {groupSiblings.length} sessions</strong> ({groupDayLabel}) for this class — they were generated together and move together. This action <strong>cannot be undone</strong>.</>
                    ) : (
                      <>This action <strong>cannot be undone</strong>.</>
                    )}
                  </p>
                </div>
              </div>
            )
          })()}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteEntryId(null)}
              disabled={deleteEntry.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
              disabled={deleteEntry.isPending}
              onClick={() => {
                if (!deleteEntryId || !selectedScheduleId) return
                deleteEntry.mutate(
                  { scheduleId: selectedScheduleId, entryId: deleteEntryId },
                  {
                    onSuccess: () => {
                      setDeleteEntryId(null)
                      toast.success("Entry deleted")
                    },
                    onError: (err: any) => {
                      toast.error(err.message)
                    },
                  }
                )
              }}
            >
              {deleteEntry.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        scheduleId={selectedScheduleId}
        // Dept Chairs only: their faculty teach across departments, so they can
        // export the whole semester rather than just this department's schedule.
        canExportTerm={isSuperAdmin}
      />


    </div>
    </RoleGuard>
  )
}
