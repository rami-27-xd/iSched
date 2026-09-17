/**
 * Audit-log action vocabulary + human labels. Client-safe (no database
 * imports) so the Dean's System Logs page can render them; lib/audit.ts
 * re-exports these for the server side.
 */
export type AuditAction =
  | "schedule.created"
  | "schedule.deleted"
  | "schedule.archived"
  | "schedule.unarchived"
  | "schedule.generated"
  | "schedule.submitted"
  | "schedule.approved"
  | "schedule.rejected"
  | "schedule.reset"
  | "schedule.published"
  | "schedule.unpublished"
  | "schedule.gecClusterFinalized"
  | "schedule.gecFullyFinalized"
  | "schedule.gecReopened"
  | "entry.created"
  | "entry.updated"
  | "entry.deleted"
  | "user.approved"
  | "user.updated"
  | "user.deactivated"
  | "user.activated"
  | "user.deleted"
  | "faculty.created"
  | "faculty.updated"
  | "faculty.deleted"
  | "availability.updated"
  | "availability.buildings"
  | "subject.created"
  | "subject.updated"
  | "subject.deleted"
  | "room.created"
  | "room.updated"
  | "room.deleted"
  | "building.created"
  | "building.updated"

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "schedule.created": "Schedule created",
  "schedule.deleted": "Schedule deleted",
  "schedule.archived": "Schedule archived",
  "schedule.unarchived": "Schedule restored",
  "schedule.generated": "Schedule generated",
  "schedule.submitted": "Submitted for approval",
  "schedule.approved": "Schedule approved",
  "schedule.rejected": "Schedule rejected",
  "schedule.reset": "Schedule reset to draft",
  "schedule.published": "Schedule published",
  "schedule.unpublished": "Schedule unpublished",
  "schedule.gecClusterFinalized": "GEC/GEL finalized (one cluster)",
  "schedule.gecFullyFinalized": "GEC/GEL fully finalized",
  "schedule.gecReopened": "GEC/GEL reopened",
  "entry.created": "Class added",
  "entry.updated": "Class edited",
  "entry.deleted": "Class removed",
  "user.approved": "Account approved",
  "user.updated": "Account updated",
  "user.deactivated": "Account deactivated",
  "user.activated": "Account reactivated",
  "user.deleted": "Account deleted",
  "faculty.created": "Faculty added",
  "faculty.updated": "Faculty updated",
  "faculty.deleted": "Faculty removed",
  "availability.updated": "Availability changed",
  "availability.buildings": "Building access changed",
  "subject.created": "Subject added",
  "subject.updated": "Subject updated",
  "subject.deleted": "Subject removed",
  "room.created": "Room added",
  "room.updated": "Room updated",
  "room.deleted": "Room removed",
  "building.created": "Building added",
  "building.updated": "Building updated",
}
