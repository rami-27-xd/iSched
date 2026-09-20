/**
 * Role-specific workflow diagrams for the User Manual (client-safe data).
 *
 * Each role gets ONE flowchart: the steps they actually perform, in order,
 * with the points where they wait on another role, the decisions they face
 * and the rules the app enforces along the way. Rendered by
 * components/manual/workflow-diagram.tsx — nodes are placed on a small grid
 * (`col` 0 = the main lane, 1 = a side lane; `row` top to bottom) so the
 * layout is deterministic and reads top-down like a checklist.
 */
import type { UserRole } from "@/lib/roles"

export type FlowKind = "start" | "step" | "decision" | "wait" | "end"

export interface FlowNode {
  id: string
  kind: FlowKind
  title: string
  detail?: string
  /** Where in the app this happens (shown as a small caption). */
  where?: string
  href?: string
  /** The app blocks the alternative — shown as an "Enforced" badge. */
  enforced?: boolean
  col: number
  row: number
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
}

export interface RoleManual {
  role: UserRole
  heading: string
  summary: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** Short "where things are" cards under the diagram. */
  places: { title: string; body: string; href: string }[]
  /** Rules the app enforces for this role, one line each. */
  rules: string[]
}

// ─── Department Chairperson ───────────────────────────────────────────────────

const DEPARTMENT_CHAIRPERSON: RoleManual = {
  role: "SUPER_ADMIN",
  heading: "Department Chairperson — GEC/GEL first, then approve",
  summary:
    "You plot the general-education backbone (your area's GEC/GEL subjects) for every department, declare it finalized, and later approve or return each department's submitted schedule.",
  nodes: [
    { id: "start", kind: "start", title: "Sign in as Department Chairperson", col: 0, row: 0 },
    { id: "prep", kind: "step", title: "Prepare the term", detail: "Create each department's schedule for the term; tag CAS faculty with the GEC/GEL codes they teach; mark their availability for that term.", where: "Manage Schedules · Faculty · Faculty Availability", href: "/dashboard/schedules", col: 0, row: 1 },
    { id: "citlabs", kind: "wait", title: "CIT pre-plots its laboratory subjects", detail: "Only the CIT Program Chairperson can place or move CIT labs. Their slots are locked before GEC is generated.", col: 1, row: 1 },
    { id: "generate", kind: "step", title: "Generate GEC/GEL for your area", detail: "Open a department's schedule and click Generate. A 3-unit GEC meets 1 h × 3 or 1.5 h × 2 — never one 3-hour block — and can never land on a locked CIT lab slot.", where: "Manage Schedules → Generate", href: "/dashboard/schedules", enforced: true, col: 0, row: 2 },
    { id: "issues", kind: "decision", title: "Anything unassigned or in conflict?", detail: "Check the Unassigned list and the Conflicts banner.", col: 0, row: 3 },
    { id: "fix", kind: "step", title: "Fix by hand", detail: "Manually Assign the class, or send the CIT Program Chairperson a tracked request to move a lab that blocks GEC.", where: "Manually Assign · Lab requests", href: "/dashboard/schedules", col: 1, row: 3 },
    { id: "finalize", kind: "step", title: "Finalize my GEC/GEL", detail: "Declares your area complete for THIS schedule. Program Chairpersons unlock only once all three department heads have finalized; any later GEC edit reopens yours automatically.", where: "GEC/GEL finalization card", href: "/dashboard/schedules", enforced: true, col: 0, row: 4 },
    { id: "pcs", kind: "wait", title: "Program Chairpersons add their majors and submit", detail: "PATHFit and NSTP are placed by their Directors meanwhile.", col: 0, row: 5 },
    { id: "review", kind: "decision", title: "Review the submitted schedule", detail: "Pending Approval: resolve any conflicts the term check reports.", where: "Manage Schedules → Approve / Reject", href: "/dashboard/schedules", col: 0, row: 6 },
    { id: "reject", kind: "step", title: "Reject with a note", detail: "The schedule returns to Draft with your reason shown to the Program Chairperson.", col: 1, row: 6 },
    { id: "publish", kind: "step", title: "Approve → Published", detail: "Print the ISO Schedule of Subjects and the Teaching Load letters from the ⋯ menu → Export.", where: "Export", href: "/dashboard/schedules", col: 0, row: 7 },
    { id: "end", kind: "end", title: "Term scheduled — monitor everything in System Logs", col: 0, row: 8 },
  ],
  edges: [
    { from: "start", to: "prep" },
    { from: "citlabs", to: "generate", label: "locked slots" },
    { from: "prep", to: "generate" },
    { from: "generate", to: "issues" },
    { from: "issues", to: "fix", label: "yes" },
    { from: "fix", to: "generate", label: "re-check" },
    { from: "issues", to: "finalize", label: "no" },
    { from: "finalize", to: "pcs" },
    { from: "pcs", to: "review" },
    { from: "review", to: "reject", label: "problems" },
    { from: "reject", to: "pcs", label: "back to Draft" },
    { from: "review", to: "publish", label: "approve" },
    { from: "publish", to: "end" },
  ],
  places: [
    { title: "Manage Schedules", body: "New Schedule, Generate, Add Entry, the GEC/GEL finalization card, Approve / Reject, Export.", href: "/dashboard/schedules" },
    { title: "Faculty & Availability", body: "Tag CAS faculty per GEC/GEL code; set Regular / COSI and mark hours per term; allocate an instructor when a Program Chairperson requests one.", href: "/dashboard/availability" },
    { title: "Departments", body: "GEC/GEL subjects: units, room needed and the longest session per day (1 h or 1 h 30 min).", href: "/dashboard/subjects" },
    { title: "Subject Summary (in System Logs)", body: "Which programs take each GEC in which semester — planned vs. scheduled.", href: "/dashboard/logs" },
    { title: "System Logs", body: "The audit trail across departments, every scheduled class, the Subject Summary and each building's room grid by day.", href: "/dashboard/logs" },
  ],
  rules: [
    "You can only place your own area's GEC/GEL codes (and CAS majors on the CAS schedule); other colleges' majors are view-only.",
    "GEC/GEL sessions are limited per day (default 1 h 30 min) — no single 3-hour block, generated or by hand.",
    "A GEC class can never take a slot a CIT laboratory already occupies; ask the CIT Program Chairperson to move the lab instead.",
    "Every placement needs a faculty member tagged for that exact subject and available at that time in that term.",
    "Program Chairpersons stay locked until all three department heads have finalized this schedule.",
  ],
}

// ─── Program Chairperson ──────────────────────────────────────────────────────

const PROGRAM_CHAIRPERSON: RoleManual = {
  role: "ADMIN",
  heading: "Program Chairperson — your program's major subjects",
  summary:
    "You prepare your program's faculty and sections, wait for the GEC/GEL backbone, then add or generate your full major load and submit it for approval.",
  nodes: [
    { id: "start", kind: "start", title: "Sign in as Program Chairperson", col: 0, row: 0 },
    { id: "prep", kind: "step", title: "Prepare your program", detail: "Sections per year level; faculty records with specializations and Regular / COSI type; each faculty member's hours for the term.", where: "Departments · Faculty · Faculty Availability", href: "/dashboard/faculty", col: 0, row: 1 },
    { id: "cit", kind: "decision", title: "Is this a CIT program?", col: 0, row: 2 },
    { id: "labs", kind: "step", title: "Pre-plot laboratory subjects only", detail: "Place your CIT labs first — they become locked slots that GEC is scheduled around. Lectures stay blocked until GEC is finalized.", where: "Add Entry / Generate (labs only)", href: "/dashboard/schedules", enforced: true, col: 1, row: 2 },
    { id: "wait", kind: "wait", title: "Wait for GEC/GEL to be finalized", detail: "The \"Waiting for GEC\" banner lists which of the three department heads are still pending. You are notified the moment all three finalize.", col: 0, row: 3 },
    { id: "majors", kind: "step", title: "Add or generate your full major load", detail: "Lecture + lab, on the Draft. Regenerating keeps pre-plotted labs in place.", where: "Manage Schedules → Generate / Add Entry", href: "/dashboard/schedules", enforced: true, col: 0, row: 4 },
    { id: "issues", kind: "decision", title: "Anything unassigned or in conflict?", col: 0, row: 5 },
    { id: "fix", kind: "step", title: "Fix by hand", detail: "Manually Assign, or Request faculty — the Department Chairperson allocates an instructor to your program for the term.", where: "Manually Assign · Faculty → Request faculty", href: "/dashboard/faculty", col: 1, row: 5 },
    { id: "submit", kind: "step", title: "Submit for approval", detail: "The Draft becomes Pending Approval and is locked for you.", where: "Manage Schedules → Submit", href: "/dashboard/schedules", col: 0, row: 6 },
    { id: "verdict", kind: "decision", title: "Department Chairperson's decision", col: 0, row: 7 },
    { id: "rejected", kind: "step", title: "Rejected — read the note, fix, resubmit", detail: "The schedule is back in Draft with the reason shown at the top.", col: 1, row: 7 },
    { id: "published", kind: "step", title: "Approved → Published", detail: "Print each faculty member's Teaching Load from ⋯ → Export; that is how faculty receive their schedule.", where: "Export", href: "/dashboard/schedules", col: 0, row: 8 },
    { id: "end", kind: "end", title: "Done — System Logs shows every class, room and subject any time", col: 0, row: 9 },
  ],
  edges: [
    { from: "start", to: "prep" },
    { from: "prep", to: "cit" },
    { from: "cit", to: "labs", label: "yes" },
    { from: "labs", to: "wait" },
    { from: "cit", to: "wait", label: "no" },
    { from: "wait", to: "majors" },
    { from: "majors", to: "issues" },
    { from: "issues", to: "fix", label: "yes" },
    { from: "fix", to: "majors", label: "re-check" },
    { from: "issues", to: "submit", label: "no" },
    { from: "submit", to: "verdict" },
    { from: "verdict", to: "rejected", label: "rejected" },
    { from: "rejected", to: "majors", label: "edit Draft" },
    { from: "verdict", to: "published", label: "approved" },
    { from: "published", to: "end" },
  ],
  places: [
    { title: "Manage Schedules", body: "Generate, Add Entry (Single day / MWF / TTh), edit or remove a class, Submit, Export.", href: "/dashboard/schedules" },
    { title: "Faculty & Availability", body: "Specializations, Regular (21 units) / COSI (40 units), max hours, per-term availability; Request faculty when nobody qualified is free.", href: "/dashboard/availability" },
    { title: "Departments", body: "Your program's subjects and sections by year level.", href: "/dashboard/subjects" },
    { title: "System Logs", body: "What changed in your department, every scheduled class, what your programs take each semester, and who uses which room when.", href: "/dashboard/logs" },
  ],
  rules: [
    "Before GEC/GEL is finalized by all three department heads, only a CIT chair may add anything — laboratory subjects only.",
    "You place only your own program's subjects; GEC/GEL, PATHFit and NSTP belong to their own roles.",
    "Only you may add, edit, move or delete your CIT laboratory subjects — not even the Department Chairperson can.",
    "A faculty member must be tagged for the subject and available at that time in that term; labs need lab rooms. Regular faculty carry at most 21 units, COSI at most 40.",
    "No Saturday classes (except CAM sections). Some load limits can be overridden deliberately with Save Anyway; double-bookings cannot.",
  ],
}

// ─── Dean ─────────────────────────────────────────────────────────────────────

const DEAN: RoleManual = {
  role: "DEAN",
  heading: "Dean — approve accounts, oversee the department",
  summary:
    "You approve your department's chairperson accounts and keep watch over its schedules, rooms and activity. Everywhere else the Dean has view-only access.",
  nodes: [
    { id: "start", kind: "start", title: "Sign in as Dean (approved automatically as the first Dean of the department)", col: 0, row: 0 },
    { id: "pending", kind: "decision", title: "New account waiting for approval?", detail: "The dashboard and User Management list them.", where: "Dashboard · User Management", href: "/dashboard/users", col: 0, row: 1 },
    { id: "approve", kind: "step", title: "Approve and assign", detail: "Set a Program Chairperson's program, or a Department Chairperson's area. The app refuses a second Dean, PATHFit Director or NSTP Director.", where: "User Management", href: "/dashboard/users", enforced: true, col: 1, row: 1 },
    { id: "monitor", kind: "step", title: "Monitor the term", detail: "Schedules and their status, unassigned and conflict counts; who did what and when; every scheduled class; who is in which room.", where: "System Logs", href: "/dashboard/logs", col: 0, row: 2 },
    { id: "issue", kind: "decision", title: "Something needs action?", col: 0, row: 3 },
    { id: "contact", kind: "step", title: "Ask the responsible chairperson", detail: "The log names who did it; schedules are edited by their chairperson, not the Dean.", col: 1, row: 3 },
    { id: "end", kind: "end", title: "Term published — exports are printed by the chairpersons", col: 0, row: 4 },
  ],
  edges: [
    { from: "start", to: "pending" },
    { from: "pending", to: "approve", label: "yes" },
    { from: "approve", to: "monitor" },
    { from: "pending", to: "monitor", label: "no" },
    { from: "monitor", to: "issue" },
    { from: "issue", to: "contact", label: "yes" },
    { from: "contact", to: "monitor" },
    { from: "issue", to: "end", label: "no" },
  ],
  places: [
    { title: "User Management", body: "Approve registrations, assign programs and areas, change roles, deactivate or delete accounts of your department.", href: "/dashboard/users" },
    { title: "System Logs", body: "Activity (with a colour key by role and action), every schedule of the department, every scheduled class, the Subject Summary and the room grid — all colour-coded by department.", href: "/dashboard/logs" },
  ],
  rules: [
    "One Dean per department; the first to register is approved automatically.",
    "Department and Program Chairpersons of your department wait for your approval before they can sign in.",
    "The Dean never edits schedules, faculty, subjects or rooms — every data page is read-only.",
  ],
}

// ─── PATHFit Director ─────────────────────────────────────────────────────────

const PATHFIT: RoleManual = {
  role: "PATHFIT",
  heading: "PATHFit Director — one block per section, in the GYM",
  summary: "You generate PATHFit for every department's schedule and adjust individual classes when needed. Nothing else in the schedule is yours to edit.",
  nodes: [
    { id: "start", kind: "start", title: "Sign in as PATHFit Director (approved automatically; one account for the university)", col: 0, row: 0 },
    { id: "college", kind: "step", title: "Pick a college and open its schedule", detail: "Use the college switcher at the top, then select the term's schedule.", where: "Manage Schedules", href: "/dashboard/schedules", col: 0, row: 1 },
    { id: "generate", kind: "step", title: "Generate PATHFit", detail: "Every section receives one continuous block in the GYM with faculty TBA. Only PATHFit classes are replaced.", where: "Manage Schedules → Generate", href: "/dashboard/schedules", enforced: true, col: 0, row: 2 },
    { id: "adjust", kind: "decision", title: "A class needs a real instructor or another time?", col: 0, row: 3 },
    { id: "edit", kind: "step", title: "Edit, add or remove the class", detail: "Assign a tagged instructor, move the block, or add a class by hand with Add Entry.", where: "List / Table view → Edit", href: "/dashboard/schedules", col: 1, row: 3 },
    { id: "next", kind: "decision", title: "Another college to do?", col: 0, row: 4 },
    { id: "end", kind: "end", title: "PATHFit placed in every college", col: 0, row: 5 },
  ],
  edges: [
    { from: "start", to: "college" },
    { from: "college", to: "generate" },
    { from: "generate", to: "adjust" },
    { from: "adjust", to: "edit", label: "yes" },
    { from: "edit", to: "adjust" },
    { from: "adjust", to: "next", label: "no" },
    { from: "next", to: "college", label: "yes" },
    { from: "next", to: "end", label: "no" },
  ],
  places: [
    { title: "Manage Schedules", body: "College switcher, Generate PATHFit, Add Entry, edit or remove PATHFit classes in any college.", href: "/dashboard/schedules" },
  ],
  rules: [
    "Only the PATHFit Director may add, edit or delete PATHFit classes; you cannot touch any other subject.",
    "Generated PATHFit uses the GYM and the TBA placeholder — both are shared and exempt from double-booking checks.",
    "A real instructor you assign must be tagged for PATHFit and available at that time in that term.",
  ],
}

// ─── NSTP Director ────────────────────────────────────────────────────────────

const NSTP: RoleManual = {
  role: "NSTP",
  heading: "NSTP Director — placed by hand, sections may be merged",
  summary: "NSTP is never generated. You add each NSTP class yourself — for one section, or for two or more sections taught together — in every college's schedule.",
  nodes: [
    { id: "start", kind: "start", title: "Sign in as NSTP Director (approved automatically; one account for the university)", col: 0, row: 0 },
    { id: "college", kind: "step", title: "Pick a college and open its schedule", detail: "Use the college switcher at the top, then select the term's schedule.", where: "Manage Schedules", href: "/dashboard/schedules", col: 0, row: 1 },
    { id: "add", kind: "step", title: "Add Entry → section → NSTP subject", detail: "Then the instructor (tagged for NSTP), room, day — Saturday is allowed for NSTP — and time.", where: "⋯ menu → Add Entry", href: "/dashboard/schedules", col: 0, row: 2 },
    { id: "merge", kind: "decision", title: "Do several sections take this class together?", col: 0, row: 3 },
    { id: "tick", kind: "step", title: "Tick the other sections under \"Merge with other sections\"", detail: "One class, one room, one instructor for all of them. Each section's own timetable is still checked; the room and instructor count once.", enforced: true, col: 1, row: 3 },
    { id: "save", kind: "step", title: "Save", detail: "Merged classes show one line with every section and a \"Merged\" badge.", col: 0, row: 4 },
    { id: "change", kind: "decision", title: "Need to change something later?", col: 0, row: 5 },
    { id: "edit", kind: "step", title: "Edit the class", detail: "Move it, change the instructor or room, or add / remove sections from the merged class. Delete removes it for every section.", where: "List / Table view → Edit", href: "/dashboard/schedules", col: 1, row: 5 },
    { id: "next", kind: "decision", title: "More NSTP classes or another college?", col: 0, row: 6 },
    { id: "end", kind: "end", title: "NSTP placed in every college", col: 0, row: 7 },
  ],
  edges: [
    { from: "start", to: "college" },
    { from: "college", to: "add" },
    { from: "add", to: "merge" },
    { from: "merge", to: "tick", label: "yes" },
    { from: "tick", to: "save" },
    { from: "merge", to: "save", label: "no" },
    { from: "save", to: "change" },
    { from: "change", to: "edit", label: "yes" },
    { from: "edit", to: "change" },
    { from: "change", to: "next", label: "no" },
    { from: "next", to: "college", label: "yes" },
    { from: "next", to: "end", label: "no" },
  ],
  places: [
    { title: "Manage Schedules", body: "College switcher, Add Entry with the merge picker, edit (add / remove sections) or remove NSTP classes in any college.", href: "/dashboard/schedules" },
  ],
  rules: [
    "Only the NSTP Director may add, edit or delete NSTP classes; you cannot touch any other subject.",
    "Only NSTP classes can be merged across sections.",
    "NSTP may be held on Saturdays; the instructor must be tagged for NSTP and available at that time in that term.",
  ],
}

export const ROLE_MANUALS: Record<Exclude<UserRole, "FACULTY">, RoleManual> = {
  SUPER_ADMIN: DEPARTMENT_CHAIRPERSON,
  ADMIN: PROGRAM_CHAIRPERSON,
  DEAN,
  PATHFIT,
  NSTP,
}

export function manualForRole(role: string | null | undefined): RoleManual | null {
  return (ROLE_MANUALS as Record<string, RoleManual>)[role ?? ""] ?? null
}
