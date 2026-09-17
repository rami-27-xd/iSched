"use client"

import Link from "next/link"
import {
  BookOpen,
  CalendarDays,
  Clock,
  Building2,
  FileDown,
  ShieldCheck,
  ScrollText,
  Dumbbell,
  Flag,
  Workflow,
  ArrowDown,
  UserCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useUserRole } from "@/components/layout/dashboard-shell"
import { ROLE_LABELS, type UserRole } from "@/lib/roles"

// ─── Content ──────────────────────────────────────────────────────────────────

type StepRole = "PC_CIT" | "DC" | "PATHFIT" | "NSTP" | "PC_ALL"

const STEP_ROLE_META: Record<StepRole, { label: string; badge: string; dot: string }> = {
  PC_CIT:  { label: "CIT Program Chairperson", badge: "bg-[#D4AF37]/15 text-[#8a6d1a] border-[#D4AF37]/40", dot: "bg-[#D4AF37]" },
  DC:      { label: "Department Chairperson",  badge: "bg-[#1B4332]/10 text-[#1B4332] border-[#1B4332]/30", dot: "bg-[#1B4332]" },
  PATHFIT: { label: "PATHFit Director",        badge: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  NSTP:    { label: "NSTP Director",           badge: "bg-sky-100 text-sky-800 border-sky-200",             dot: "bg-sky-500" },
  PC_ALL:  { label: "All Program Chairpersons", badge: "bg-[#D4AF37]/15 text-[#8a6d1a] border-[#D4AF37]/40", dot: "bg-[#D4AF37]" },
}

const WORKFLOW_STEPS: { n: number; role: StepRole; title: string; body: string; hard?: boolean }[] = [
  {
    n: 1,
    role: "PC_CIT",
    title: "CIT pre-plots laboratory subjects only",
    body: "Before anything else, the CIT Program Chairperson plots CIT laboratory subjects. No lecture or other major subjects yet — labs are locked in first. (CIT only.)",
    hard: true,
  },
  {
    n: 2,
    role: "DC",
    title: "Department Chairperson generates GEC/GEL for all colleges",
    body: "The Department Chairperson runs Generate: the general-education subjects under their area are placed for every section. A GEC class can never land on a slot a CIT lab already occupies — no override.",
    hard: true,
  },
  {
    n: 3,
    role: "PATHFIT",
    title: "PATHFit Director generates PATHFit; NSTP Director adds NSTP",
    body: "The PATHFit Director runs Generate on each department's schedule: one continuous block per section, held in the GYM with faculty TBA. NSTP is never auto-generated — the NSTP Director adds NSTP classes with Add Entry.",
  },
  {
    n: 4,
    role: "DC",
    title: "Lab conflict? The Department Chairperson requests a move",
    body: "The Department Chairperson cannot edit CIT labs. If a lab blocks a GEC placement, they send a tracked request to the owning CIT Program Chairperson to move it.",
  },
  {
    n: 5,
    role: "DC",
    title: "GEC/GEL becomes the backbone",
    body: "Once GEC/GEL exists in a schedule, Add Entry, Generate and Submit unlock for its Program Chairpersons. Until then the app blocks them (a \"Waiting for GEC\" banner explains this).",
    hard: true,
  },
  {
    n: 6,
    role: "PC_ALL",
    title: "Program Chairpersons add their major subjects and submit",
    body: "Each Program Chairperson adds or generates their program's full major load (lecture + lab) on the Draft schedule, then submits it for approval. Regenerating keeps pre-plotted CIT labs in place.",
  },
  {
    n: 7,
    role: "DC",
    title: "Department Chairperson approves and publishes",
    body: "The Department Chairperson reviews the submitted schedule, resolves conflicts, then approves it. A published schedule is what the ISO and Teaching Load exports are printed from.",
  },
]

const ENFORCED_RULES = [
  "Only the owning CIT Program Chairperson may add, edit, move, or delete a CIT laboratory subject — not the Department Chairperson, not another program's chairperson.",
  "The Department Chairperson may view a Program Chairperson's major-subject schedule but cannot edit it (except in CAS, where the Department Chairperson holds delegated access).",
  "Only the PATHFit Director may add, edit, or delete PATHFit classes; only the NSTP Director may add, edit, or delete NSTP classes.",
  "Program Chairpersons edit only within their own college; each sees only their own college's schedules.",
  "Every placement — generated or entered by hand — is bound by the faculty member's tagged specializations (no exceptions: a CAS faculty member must be tagged for each GEC/GEL subject they teach, e.g. \"GEC01 - Understanding the Self\"), their availability and building access for that term, and room/building access.",
  "Laboratory subjects go only to laboratory rooms (computer-based labs to a Computer Laboratory); lectures go to lecture rooms.",
  "Only CAM sections and NSTP classes may be held on a Saturday.",
  "CAS faculty teach GEC/GEL in every college. For major subjects a Program Chairperson's own program is searched first; when nobody qualified is available they request an instructor and the Department Chairperson allocates one for the term.",
  "Each term (Academic Year + Semester) is kept completely separate: 1st-semester availability, building access and bookings are never used for a 2nd-semester schedule, and archived schedules are ignored.",
]

interface Section {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  roles: UserRole[] | "all"
  body: React.ReactNode
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed">{children}</li>
}

const SECTIONS: Section[] = [
  {
    id: "accounts",
    title: "Accounts and approval",
    icon: UserCheck,
    roles: "all",
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <Li>Register on the sign-up page with your exact title: Dean, Department Chairperson, Program Chairperson, PATHFit Director or NSTP Director.</Li>
        <Li>The <strong>Dean of your department</strong> approves Department and Program Chairperson accounts from <em>User Management</em>. Until then you see a "Pending Approval" screen.</Li>
        <Li>The <strong>first Dean of a department</strong> is approved automatically; a department can only ever have one Dean.</Li>
        <Li>There is exactly <strong>one PATHFit Director</strong> and <strong>one NSTP Director</strong> account for the whole university. They are approved automatically; the sign-up form refuses a second one.</Li>
        <Li>Faculty members do not sign in. They are records kept by their chairperson and receive their schedule as a printed Teaching Load.</Li>
      </ul>
    ),
  },
  {
    id: "roles",
    title: "Roles at a glance",
    icon: ShieldCheck,
    roles: "all",
    body: (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4">Role</th>
              <th className="py-2">What they do</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr><td className="py-2 pr-4 font-medium whitespace-nowrap">Dean</td><td className="py-2">Approves their department's accounts; reads System Logs (department activity, every department schedule, room occupancy in their buildings). View-only everywhere else.</td></tr>
            <tr><td className="py-2 pr-4 font-medium whitespace-nowrap">Department Chairperson</td><td className="py-2">Generates and manages GEC/GEL and CAS major subjects; approves or rejects submitted schedules; sees every college.</td></tr>
            <tr><td className="py-2 pr-4 font-medium whitespace-nowrap">Program Chairperson</td><td className="py-2">Manages their own program's major subjects, faculty and availability; submits the schedule for approval.</td></tr>
            <tr><td className="py-2 pr-4 font-medium whitespace-nowrap">PATHFit Director</td><td className="py-2">Generates and manages PATHFit classes in every college's schedule.</td></tr>
            <tr><td className="py-2 pr-4 font-medium whitespace-nowrap">NSTP Director</td><td className="py-2">Adds and manages NSTP classes in every college's schedule (never auto-generated).</td></tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "workflow",
    title: "Scheduling workflow",
    icon: Workflow,
    roles: "all",
    body: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The sequential process for building a semester schedule: GEC/GEL first, then PATHFit and NSTP, then each program's major subjects.
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STEP_ROLE_META) as StepRole[]).filter((k) => k !== "PC_ALL").map((k) => (
            <span key={k} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${STEP_ROLE_META[k].badge}`}>
              <span className={`h-2 w-2 rounded-full ${STEP_ROLE_META[k].dot}`} />
              {STEP_ROLE_META[k].label}
            </span>
          ))}
        </div>
        <ol className="space-y-0">
          {WORKFLOW_STEPS.map((step, i) => {
            const meta = STEP_ROLE_META[step.role]
            return (
              <li key={step.n} className="relative">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${meta.dot}`}>{step.n}</div>
                    {i < WORKFLOW_STEPS.length - 1 && (
                      <div className="my-1 flex flex-1 flex-col items-center">
                        <div className="w-px flex-1 bg-border" />
                        <ArrowDown className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="pb-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{step.title}</p>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${meta.badge}`}>{meta.label}</span>
                      {step.hard && <Badge variant="outline" className="text-[10px] border-red-200 bg-red-50 text-red-700">Enforced by the app</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Rules the system enforces</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {ENFORCED_RULES.map((r) => <Li key={r}>{r}</Li>)}
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "schedules",
    title: "Manage Schedules",
    icon: CalendarDays,
    roles: ["SUPER_ADMIN", "ADMIN", "PATHFIT", "NSTP", "DEAN"],
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <Li><strong>New Schedule</strong> creates a Draft for a semester and department. One schedule per department per term.</Li>
        <Li><strong>Generate</strong> places the subjects your role owns automatically, honouring availability, specialization, load limits, room types and building access. Existing entries for those subjects are replaced; everything else is left alone.</Li>
        <Li><strong>Add Entry</strong> (in the ⋯ menu) places one class by hand: subject, section, faculty, room, day(s) and time. Conflicts are checked as you save; some limits can be overridden deliberately with <em>Save Anyway</em>.</Li>
        <Li>Click a class in the List or Table view to <strong>edit or remove</strong> it. Multi-day classes (MWF / TTh) are edited as one.</Li>
        <Li>Use the <strong>day tabs</strong> (All days, Mon–Sat) and the Faculty / Section / Room filters to narrow the view; the Calendar view colours classes per subject and marks conflicts in red.</Li>
        <Li>Classes that could not be placed appear in the <strong>Unassigned</strong> list with the reason; use <em>Manually Assign</em> to fix them.</Li>
        <Li><strong>Submit</strong> sends a Draft for approval (Program Chairpersons). <strong>Publish</strong> / <strong>Approve</strong> finalise it (Department Chairperson). Archive removes a finished term from the working lists without deleting it.</Li>
      </ul>
    ),
  },
  {
    id: "faculty",
    title: "Faculty and availability",
    icon: Clock,
    roles: ["SUPER_ADMIN", "ADMIN", "DEAN"],
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <Li>The <strong>Faculty</strong> page keeps each faculty member's record: specializations (the subjects they may be assigned), <strong>Max Units</strong> and <strong>Max Hours</strong> per week, and status.</Li>
        <Li><strong>Faculty Availability</strong> is where you mark, <strong>per term</strong>, the hours each faculty member can teach: pick the term (e.g. 1st Semester 2026–2027) at the top, then drag across the timeline, use the Morning / Afternoon / Full Day presets, or clear a day. The <em>Max hours / week</em> box caps what can be marked.</Li>
        <Li>The Term list only offers terms that have a <strong>non-archived schedule</strong> in your department — create the schedule in Manage Schedules first. Generation and manual entry use strictly that term's availability; other semesters are never consulted.</Li>
        <Li><strong>Building access</strong> — the building chips on each card — records which buildings the faculty member may teach in that term (no chips selected = any building). It is a hard constraint for the generator and for manual entry.</Li>
        <Li>Short of qualified faculty for a term? On the Faculty page, <strong>Request faculty</strong> sends the Department Chairperson a request; when they approve it they <strong>allocate</strong> an instructor, who then appears in your Add Entry picker and is included when you generate — for that term only.</Li>
      </ul>
    ),
  },
  {
    id: "data",
    title: "Departments, subjects, sections, buildings and rooms",
    icon: Building2,
    roles: ["SUPER_ADMIN", "ADMIN", "DEAN"],
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <Li><strong>Departments</strong> lists each program's curriculum by year and semester. Subjects carry units, type (lecture / laboratory), the room type they need and — for computer laboratories — the lab specialization.</Li>
        <Li><strong>Sections</strong> belong to a year level of a program (for example <em>BSInfoTech 1-A</em>). The generator schedules every subject of a year for every section of that year.</Li>
        <Li><strong>Buildings</strong> can be restricted to departments; <strong>rooms</strong> can additionally be restricted to programs. A restricted room is only offered to the sections it is open to. TBA and GYM are shared placeholders.</Li>
      </ul>
    ),
  },
  {
    id: "exports",
    title: "Exports",
    icon: FileDown,
    roles: ["SUPER_ADMIN", "ADMIN", "DEAN", "PATHFIT", "NSTP"],
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <Li><strong>Schedule of Subjects (ISO form)</strong> — one page per section, printed from the published schedule with the signatories you enter.</Li>
        <Li><strong>Teaching Load</strong> — one letter per faculty member listing their classes and contact hours; this is how faculty receive their schedule.</Li>
        <Li>Both are in the ⋯ menu of Manage Schedules (<em>Export</em>). Signatories are remembered on this device.</Li>
      </ul>
    ),
  },
  {
    id: "dean",
    title: "For the Dean: User Management and System Logs",
    icon: ScrollText,
    roles: ["DEAN"],
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <Li><strong>User Management</strong> lists the accounts of your department. Approve new registrations, set a Program Chairperson's program (or a CAS Department Chairperson's area), change roles, deactivate or delete accounts. The system refuses a second Dean for the department and a second PATHFit or NSTP Director.</Li>
        <Li><strong>System Logs → Activity</strong> is the audit trail of what was done within your department: schedules generated, submitted and approved, classes added or removed, accounts approved, faculty and room changes — with who did it and when.</Li>
        <Li><strong>System Logs → Schedules</strong> shows every schedule of your department with its status, class count and conflicts.</Li>
        <Li><strong>System Logs → Room Occupancy</strong> shows, for each room in the buildings assigned to your department, every class held there this term — including classes from other departments' schedules.</Li>
        <Li>Everywhere else the Dean has view-only access.</Li>
      </ul>
    ),
  },
  {
    id: "pathfit",
    title: "For the PATHFit Director",
    icon: Dumbbell,
    roles: ["PATHFIT"],
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <Li>Open <strong>Manage Schedules</strong>, switch to the college you are working on, select its schedule and click <strong>Generate PATHFit</strong>.</Li>
        <Li>Every section of that department receives its PATHFit class as one continuous block in the GYM with faculty TBA. Only PATHFit entries are replaced; GEC and major subjects are untouched.</Li>
        <Li>Use <strong>Add Entry</strong> / edit / remove to adjust individual PATHFit classes or assign a real instructor. You cannot edit any other subject.</Li>
      </ul>
    ),
  },
  {
    id: "nstp",
    title: "For the NSTP Director",
    icon: Flag,
    roles: ["NSTP"],
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <Li>NSTP is never generated automatically. Open <strong>Manage Schedules</strong>, switch to the college, select its schedule and use <strong>Add Entry</strong> to place each NSTP class (NSTP classes may be held on Saturdays).</Li>
        <Li>Edit or remove your NSTP classes from the List or Table view. You cannot edit any other subject.</Li>
      </ul>
    ),
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UserManualPage() {
  const role = useUserRole() as UserRole
  const visible = SECTIONS.filter((s) => s.roles === "all" || s.roles.includes(role))
  const mine = SECTIONS.filter((s) => s.roles !== "all" && s.roles.length === 1 && s.roles[0] === role)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="border-[#1B4332]/20 bg-gradient-to-r from-[#1B4332]/5 to-transparent">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-base font-semibold text-[#1B4332]">
              <BookOpen className="h-5 w-5" />
              How to use iSched
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You are signed in as <strong className="text-foreground">{ROLE_LABELS[role] ?? role}</strong>.
              {mine.length > 0 && (
                <>
                  {" "}Start with{" "}
                  <a href={`#${mine[0].id}`} className="font-medium text-[#1B4332] underline underline-offset-2">
                    {mine[0].title}
                  </a>
                  .
                </>
              )}
            </p>
          </div>
          <nav className="flex flex-wrap gap-1.5 text-xs">
            {visible.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                {s.title}
              </a>
            ))}
          </nav>
        </CardContent>
      </Card>

      {visible.map((s) => {
        const Icon = s.icon
        return (
          <Card key={s.id} id={s.id} className="scroll-mt-24">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="h-4 w-4 text-[#1B4332]" />
                {s.title}
              </CardTitle>
            </CardHeader>
            <CardContent>{s.body}</CardContent>
          </Card>
        )
      })}

      <p className="text-center text-xs text-muted-foreground">
        Need something that isn't here? Ask your Dean, or open{" "}
        <Link href="/dashboard/schedules" className="underline underline-offset-2">Manage Schedules</Link> to get started.
      </p>
    </div>
  )
}
