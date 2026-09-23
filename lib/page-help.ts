/**
 * Brief, per-page contextual help for the floating help button
 * (components/shared/floating-help-button.tsx). Client-safe — no database imports.
 *
 * Deliberately short: a handful of "how do I use this page" bullets, not the full
 * per-role workflow (that level of depth lives in lib/manual-workflows.ts, no longer
 * linked from the sidebar). Content can vary per role when the same route means
 * different things to different people (e.g. Manage Schedules for a Dean vs. a
 * Department Chairperson vs. a Program Chairperson).
 */
import type { UserRole } from "@/lib/roles"

export interface PageHelpContent {
  title: string
  tips: string[]
}

type RoleHelpMap = Partial<Record<UserRole, PageHelpContent>>

const SCHEDULES_HELP: RoleHelpMap = {
  DEAN: {
    title: "Manage Schedules",
    tips: [
      "Read-only for your role — you can open any department's schedule (including drafts) but can't add, edit or generate.",
      "Use the status badge and the Unassigned/Conflicts counts to see how a schedule is progressing.",
      "For the full activity trail, see System Logs instead.",
    ],
  },
  SUPER_ADMIN: {
    title: "Manage Schedules — Department Chairperson",
    tips: [
      "Plot your area's GEC/GEL first — Generate handles it, or use Add Entry by hand.",
      "Click Finalize my GEC/GEL once your area is done; Program Chairpersons stay locked out of their majors until all three department heads finalize.",
      "CIT's laboratory subjects are pre-plotted and locked — GEC can never land on those slots.",
      "Approve or Reject each department's submitted schedule from Pending Approval.",
      "Export the ISO Schedule of Subjects and Teaching Load once a schedule is published.",
    ],
  },
  ADMIN: {
    title: "Manage Schedules — Program Chairperson",
    tips: [
      "Add your program's major subjects (lecture + lab) once all three department heads finalize GEC/GEL — a banner here shows who you're waiting on.",
      "CIT chairs can pre-plot laboratory subjects earlier, before GEC is finalized.",
      "Submit sends your Draft to the Department Chairperson for approval; a rejection returns it with their note.",
      "Only you may edit your own program's major subjects — other chairs' majors are view-only.",
    ],
  },
  PATHFIT: {
    title: "Manage Schedules — PATHFit Director",
    tips: [
      "Generate places one continuous PATHFit block per section, faculty \"TBA\" and room \"GYM\" — those placeholders are exempt from double-booking checks.",
      "You can add, edit or delete PATHFit entries in any college's schedule.",
    ],
  },
  NSTP: {
    title: "Manage Schedules — NSTP Director",
    tips: [
      "NSTP is never auto-generated — add each class by hand with Add Entry.",
      "To merge two or more sections into one class, tick \"Merge with other sections\" — they show as one row with a Merged badge.",
      "You can add, edit or delete NSTP entries in any college's schedule.",
    ],
  },
}

const LOGS_HELP: PageHelpContent = {
  title: "System Logs",
  tips: [
    "Activity — the audit trail of who did what; filter by action, role or date and export CSV.",
    "Schedules / Classes — every schedule and every scheduled class in scope this term.",
    "Subject Summary — which programs take each subject, planned vs. scheduled, per semester.",
    "Room Occupancy — a colour-coded room × time grid per building; switch to List view for a flat list.",
  ],
}

const PAGE_HELP: Record<string, PageHelpContent | RoleHelpMap> = {
  "/dashboard": {
    title: "Dashboard",
    tips: [
      "A quick snapshot: key counts up top, recent schedules below.",
      "Chairs who also teach see their own published teaching schedule here.",
      "Deans additionally see accounts awaiting approval and department-level status — act on either straight from the cards.",
    ],
  },
  "/dashboard/schedules": SCHEDULES_HELP,
  "/dashboard/availability": {
    title: "Faculty Availability",
    tips: [
      "Pick a term, then drag on a faculty member's timeline to mark them available — drag an edge to resize.",
      "The header's \"Max hours / week\" caps both what you can mark here and what the generator/manual entry may schedule.",
      "Hover a block to see its exact time range; hatched cells past the cap can't be added.",
    ],
  },
  "/dashboard/faculty": {
    title: "Faculty",
    tips: [
      "Add Faculty creates a record only — faculty don't log in, so email is optional.",
      "Tag each faculty member's specializations here; generation and manual entry both require a matching tag.",
      "Employment type (Regular/COSI) sets their weekly unit cap automatically.",
    ],
  },
  "/dashboard/subjects": {
    title: "Departments",
    tips: [
      "Browse subjects by department/program; GEC/GEL, major and lab subjects are all managed here.",
      "\"Room needed\" and, for GEC/GEL, \"Longest session per day\" drive what the generator and manual entry will accept.",
      "Only the subject's own program chair (or, for GEC/GEL, the owning department head) can edit it.",
    ],
  },
  "/dashboard/rooms": {
    title: "Buildings & Labs",
    tips: [
      "Buildings can be restricted to specific departments; rooms can additionally be restricted to specific programs.",
      "Lab rooms carry a specialization (e.g. Computer Lab) — the generator and manual entry both enforce an exact match.",
      "A building/room with no restrictions at all is open to everyone.",
    ],
  },
  "/dashboard/users": {
    title: "User Management",
    tips: [
      "Approve accounts waiting on your department, or change a Program Chairperson's assigned program.",
      "Delete is permanent — it removes the login and, if they also teach, their faculty link.",
      "Only one Dean per department, and only one PATHFit/NSTP Director system-wide, can be approved.",
    ],
  },
  "/dashboard/logs": LOGS_HELP,
  "/dashboard/settings": {
    title: "My Profile",
    tips: [
      "Update your name, and — if you're a Department Chairperson — your department and department-head area.",
      "Change Password updates your sign-in password immediately.",
      "Appearance switches the app between light and dark mode on this device.",
    ],
  },
}

const DEFAULT_HELP: PageHelpContent = {
  title: "iSched",
  tips: ["Use the sidebar to get around. Your role decides which pages and actions you can reach."],
}

/** Longest-prefix match so a sub-route (e.g. /dashboard/schedules/x) still resolves. */
export function getPageHelp(pathname: string, role: string): PageHelpContent {
  const match = Object.keys(PAGE_HELP)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0]

  const entry = match ? PAGE_HELP[match] : undefined
  if (!entry) return DEFAULT_HELP
  if ("tips" in entry) return entry
  return entry[role as UserRole] ?? DEFAULT_HELP
}
