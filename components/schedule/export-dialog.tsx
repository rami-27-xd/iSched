"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileText, GraduationCap, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  buildScheduleOfSubjectsHtml,
  buildTeachingLoadHtml,
  fetchLogoDataUrl,
  openPrintWindow,
  formatLongDate,
  type ExportEntry,
  type ExportHeader,
  type Signatories,
} from "@/lib/exports/schedule-format"

const STORAGE_KEY = "isched.exportSignatories.v1"

// Fields persisted per-browser so the chair doesn't retype signatories each time.
interface RememberedFields {
  toOffice: string
  preparedByName: string
  preparedByPosition: string
  deanName: string
  deanPosition: string
  notedByName: string
  notedByPosition: string
  isoFormCode: string
}

const EMPTY_REMEMBERED: RememberedFields = {
  toOffice: "",
  preparedByName: "",
  preparedByPosition: "",
  deanName: "",
  deanPosition: "",
  notedByName: "",
  notedByPosition: "Vice President for Academic Affairs",
  isoFormCode: "AA-INS-1.03F4, Rev.0",
}

function loadRemembered(): Partial<RememberedFields> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function semesterLabelFor(type: string | null): string {
  return type === "FIRST" ? "1st Semester" : type === "SECOND" ? "2nd Semester" : type === "SUMMER" ? "Summer" : ""
}

interface ExportDataResponse {
  entries: ExportEntry[]
  header: {
    semesterId?: string | null
    semesterType: string | null
    academicYear: string
    collegeName: string
    collegeAbbr: string
    departmentName: string
    startDate: string | null
    status: string
  }
  ownerName: string
}

interface TermDataResponse extends ExportDataResponse {
  /** Cluster or department the chair owns, e.g. "Social Sciences". */
  scopeLabel: string
  facultyTotal: number
  facultyTeaching: number
  scheduleCount: number
  departments: { abbreviation: string; name: string; status: string; entryCount: number }[]
}

export function ExportDialog({
  open,
  onOpenChange,
  scheduleId,
  canExportTerm = false,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  scheduleId: string | null
  /** SUPER_ADMIN only — unlocks the whole-semester, all-departments export. */
  canExportTerm?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<"iso" | "load" | null>(null)
  const [data, setData] = useState<ExportDataResponse | null>(null)
  // Scope of the export. "schedule" = this department only (the original
  // behaviour). "semester" = every department scheduled this term — a Dept
  // Chairperson's faculty teach across departments, so a Teaching Load built
  // from one schedule shows only part of a lecturer's real load.
  const [scope, setScope] = useState<"schedule" | "semester">("schedule")
  const [termData, setTermData] = useState<TermDataResponse | null>(null)
  const [termLoading, setTermLoading] = useState(false)
  // Marks which semester the term payload has been requested for — see the effect below.
  const termFetchedFor = useRef<string | null>(null)
  const [form, setForm] = useState<RememberedFields & { date: string; classesStartDate: string }>({
    ...EMPTY_REMEMBERED,
    date: "",
    classesStartDate: "",
  })

  // Load enriched schedule data + seed the form (remembered values win, else data-derived).
  useEffect(() => {
    if (!open || !scheduleId) return
    let cancelled = false
    setLoading(true)
    setData(null)
    setTermData(null)
    setTermLoading(false)
    setScope("schedule")
    termFetchedFor.current = null
    ;(async () => {
      try {
        const res = await fetch(`/api/schedules/${scheduleId}/export-data`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Failed to load schedule data")
        if (cancelled) return
        const payload: ExportDataResponse = json.data ?? json
        setData(payload)
        const remembered = loadRemembered()
        setForm({
          toOffice: remembered.toOffice ?? "",
          preparedByName: remembered.preparedByName || payload.ownerName || "",
          preparedByPosition:
            remembered.preparedByPosition ||
            (canExportTerm
              ? "Department Chairperson"
              : payload.header.collegeAbbr
                ? `Program Chairperson, ${payload.header.collegeAbbr}`
                : "Program Chairperson"),
          deanName: remembered.deanName ?? "",
          deanPosition:
            remembered.deanPosition ||
            (payload.header.collegeName ? `Dean, ${payload.header.collegeName}` : "Dean"),
          notedByName: remembered.notedByName ?? "",
          notedByPosition: remembered.notedByPosition || EMPTY_REMEMBERED.notedByPosition,
          isoFormCode: remembered.isoFormCode || EMPTY_REMEMBERED.isoFormCode,
          date: formatLongDate(new Date()),
          classesStartDate: formatLongDate(payload.header.startDate),
        })
      } catch (err: any) {
        if (!cancelled) toast.error(err.message ?? "Failed to load export data")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, scheduleId])

  // Fetched only when the chair actually switches to the whole-semester view —
  // it reads every schedule in the term, so it is not worth doing up front.
  //
  // The "already fetching" guard lives in a ref, NOT in state + deps. Depending on
  // `termLoading` here deadlocks: setting it re-runs the effect, React fires the
  // previous run's cleanup (`cancelled = true`), and the in-flight response then
  // skips every setter — including the one that clears the spinner. These deps
  // cannot change while the request is in flight, so the fetch always completes.
  useEffect(() => {
    const semesterId = data?.header.semesterId
    if (!open || scope !== "semester" || !semesterId) return
    if (termFetchedFor.current === semesterId) return
    termFetchedFor.current = semesterId

    let cancelled = false
    setTermLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/semesters/${semesterId}/export-data`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Failed to load semester data")
        if (!cancelled) setTermData(json.data ?? json)
      } catch (err: any) {
        // Clear the marker so switching back re-attempts rather than showing an
        // empty panel forever.
        termFetchedFor.current = null
        if (!cancelled) {
          toast.error(err.message ?? "Failed to load semester data")
          setScope("schedule")
        }
      } finally {
        if (!cancelled) setTermLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, scope, data?.header.semesterId])

  // Whichever payload the current scope points at.
  const active: ExportDataResponse | null = scope === "semester" ? termData : data

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function persist() {
    try {
      const remembered: RememberedFields = {
        toOffice: form.toOffice,
        preparedByName: form.preparedByName,
        preparedByPosition: form.preparedByPosition,
        deanName: form.deanName,
        deanPosition: form.deanPosition,
        notedByName: form.notedByName,
        notedByPosition: form.notedByPosition,
        isoFormCode: form.isoFormCode,
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered))
    } catch {
      /* localStorage unavailable — non-fatal */
    }
  }

  async function runExport(kind: "iso" | "load") {
    if (!active) return
    if (active.entries.length === 0) {
      toast.error(scope === "semester" ? "No entries scheduled this semester" : "This schedule has no entries to export")
      return
    }
    setBusy(kind)
    try {
      persist()
      const logo = await fetchLogoDataUrl()
      const header: ExportHeader = {
        semesterLabel: semesterLabelFor(active.header.semesterType),
        academicYear: active.header.academicYear,
        collegeName: active.header.collegeName,
        collegeAbbr: active.header.collegeAbbr,
        date: form.date,
        classesStartDate: form.classesStartDate,
      }
      const signatories: Signatories = {
        toOffice: form.toOffice,
        preparedByName: form.preparedByName,
        preparedByPosition: form.preparedByPosition,
        deanName: form.deanName,
        deanPosition: form.deanPosition,
        notedByName: form.notedByName,
        notedByPosition: form.notedByPosition,
        isoFormCode: form.isoFormCode,
      }
      const html =
        kind === "iso"
          ? buildScheduleOfSubjectsHtml({ entries: active.entries, header, signatories, logoDataUrl: logo })
          : buildTeachingLoadHtml({ entries: active.entries, header, signatories, logoDataUrl: logo })
      openPrintWindow(html)
    } finally {
      setBusy(null)
    }
  }

  const notPublished = active && active.header.status !== "PUBLISHED"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Schedule</DialogTitle>
          <DialogDescription>
            Generate the two official documents from this schedule. Signatory names are remembered on this
            device for next time.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading schedule data…
          </div>
        ) : !data ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data available.</div>
        ) : (
          <div className="space-y-3">
            {/* Scope — Dept Chairperson only. Their faculty teach across departments,
                so a Teaching Load built from one schedule understates a lecturer's
                real load; the semester view aggregates every department's schedule. */}
            {canExportTerm && (
              <div className="rounded-lg border border-border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Cover</span>
                  <div className="flex rounded-lg border border-input p-0.5">
                    <button
                      type="button"
                      onClick={() => setScope("schedule")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        scope === "schedule" ? "bg-[#1B4332] text-white" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      This department
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("semester")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        scope === "semester" ? "bg-[#1B4332] text-white" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Whole semester — my faculty
                    </button>
                  </div>
                  {termLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                {scope === "semester" && termData && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    <b>{termData.scopeLabel}</b> — {termData.facultyTeaching} of {termData.facultyTotal} of your
                    faculty are teaching this semester, {termData.entries.length} classes in total
                    {termData.departments.length > 0 && (
                      <>
                        {" "}across {termData.departments.map((d) => `${d.abbreviation} (${d.entryCount})`).join(", ")}
                      </>
                    )}
                    . Only your own faculty are included — other departments&apos; lecturers are left out,
                    and yours appear once with their full load wherever they teach. Best suited to{" "}
                    <b>Teaching Load</b>; Schedule of Subjects is per section, so under this scope a section
                    shows only the classes your faculty teach in it.
                  </p>
                )}
              </div>
            )}

            {notPublished && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {scope === "semester" ? (
                  <>Not every schedule your faculty appear in is published yet. You can still export a
                  draft copy for review.</>
                ) : (
                  <>This schedule is <b>{active?.header.status}</b>, not yet published. You can still export a
                  draft copy for review.</>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input value={form.date} onChange={(e) => set("date", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Classes start on</Label>
                <Input value={form.classesStartDate} onChange={(e) => set("classesStartDate", e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">To (recipient office) — ISO form</Label>
                <Input
                  value={form.toOffice}
                  placeholder="e.g. The Registrar / Dean's Office"
                  onChange={(e) => set("toOffice", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Prepared by — name</Label>
                <Input value={form.preparedByName} onChange={(e) => set("preparedByName", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prepared by — position</Label>
                <Input value={form.preparedByPosition} onChange={(e) => set("preparedByPosition", e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Dean — name (Approved by / Very truly yours)</Label>
                <Input value={form.deanName} onChange={(e) => set("deanName", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dean — position</Label>
                <Input value={form.deanPosition} onChange={(e) => set("deanPosition", e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Noted by — name (VP Academic Affairs)</Label>
                <Input value={form.notedByName} onChange={(e) => set("notedByName", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Noted by — position</Label>
                <Input value={form.notedByPosition} onChange={(e) => set("notedByPosition", e.target.value)} />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">ISO form control number</Label>
                <Input value={form.isoFormCode} onChange={(e) => set("isoFormCode", e.target.value)} />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
              <Button
                className="flex-1 bg-[#1B4332] text-white hover:bg-[#2D6A4F]"
                onClick={() => runExport("iso")}
                disabled={busy !== null || termLoading || !active}
              >
                {busy === "iso" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Schedule of Subjects (per section)
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => runExport("load")}
                disabled={busy !== null || termLoading || !active}
              >
                {busy === "load" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
                Teaching Load (per faculty)
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {active?.entries.length ?? 0} entries · opens a printable page — use your browser's “Save as PDF” to keep a copy.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
