/**
 * Colour vocabulary for the System Logs page (client-safe). One colour per
 * ROLE (who did it) and one per KIND of action (what happened), so a reader
 * can scan a long log by colour before reading a word. The role colours match
 * the ones User Management already uses for its role badges.
 */

export const ROLE_BADGE_STYLE: Record<string, string> = {
  DEAN: "bg-purple-100 text-purple-800 border-purple-200",
  SUPER_ADMIN: "bg-amber-100 text-amber-800 border-amber-200",
  ADMIN: "bg-blue-100 text-blue-800 border-blue-200",
  PATHFIT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NSTP: "bg-sky-100 text-sky-800 border-sky-200",
  FACULTY: "bg-green-100 text-green-800 border-green-200",
}

export const ROLE_DOT_STYLE: Record<string, string> = {
  DEAN: "bg-purple-500",
  SUPER_ADMIN: "bg-amber-500",
  ADMIN: "bg-blue-500",
  PATHFIT: "bg-emerald-500",
  NSTP: "bg-sky-500",
  FACULTY: "bg-green-500",
}

export interface ActionTone {
  key: string
  label: string
  className: string
  /** Shown as a tooltip on the legend chip. */
  examples: string
  matches: (action: string) => boolean
}

/**
 * Ordered — the first tone whose `matches` is true wins (actionTone below).
 */
export const ACTION_TONES: ActionTone[] = [
  {
    key: "removed",
    label: "Removed / rejected",
    className: "bg-red-100 text-red-800 border-red-200",
    examples: "Class removed, Schedule deleted, Schedule rejected, Account deactivated",
    matches: (a) => a.endsWith(".deleted") || a.endsWith(".rejected") || a.endsWith(".deactivated"),
  },
  {
    key: "approved",
    label: "Approved / published",
    className: "bg-green-100 text-green-800 border-green-200",
    examples: "Schedule approved, Schedule published, Account approved, Account reactivated",
    matches: (a) => a.endsWith(".approved") || a.endsWith(".published") || a.endsWith(".activated"),
  },
  {
    key: "created",
    label: "Added",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    examples: "Class added, Subject added, Faculty added, Room added, Schedule created",
    matches: (a) => a.endsWith(".created"),
  },
  {
    key: "generated",
    label: "Generated / submitted",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    examples: "Schedule generated, Submitted for approval",
    matches: (a) => a.endsWith(".generated") || a.endsWith(".submitted"),
  },
  {
    key: "finalized",
    label: "GEC/GEL finalized / reopened",
    className: "bg-violet-100 text-violet-800 border-violet-200",
    examples: "GEC/GEL finalized (one department head), GEC/GEL fully finalized, GEC/GEL reopened",
    matches: (a) => a.includes("gec"),
  },
  {
    key: "archived",
    label: "Archived / reset / unpublished",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    examples: "Schedule archived, Schedule restored, Schedule reset to draft, Schedule unpublished",
    matches: (a) => a.endsWith(".archived") || a.endsWith(".unarchived") || a.endsWith(".reset") || a.endsWith(".unpublished"),
  },
  {
    key: "updated",
    label: "Edited",
    className: "bg-gray-100 text-gray-700 border-gray-200",
    examples: "Class edited, Account updated, Availability changed, Building access changed, …",
    matches: () => true,
  },
]

export function actionTone(action: string): string {
  return (ACTION_TONES.find((t) => t.matches(action)) ?? ACTION_TONES[ACTION_TONES.length - 1]).className
}
