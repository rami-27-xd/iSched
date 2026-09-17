import { db } from "@/lib/db"
import { getUserDepartmentId } from "@/lib/auth"
import type { AuditAction } from "@/lib/audit-labels"

export type { AuditAction }
export { AUDIT_ACTION_LABELS } from "@/lib/audit-labels"

/**
 * Append one row to the AuditLog (the Dean's "System Logs").
 *
 * Best-effort: a logging failure must never fail the action it describes, so
 * errors are swallowed and reported to the server console only.
 *
 *   departmentId — the department the action was ABOUT (the schedule's
 *                  department, the approved user's department, …). The actor's
 *                  own department is recorded separately so a Dean also sees
 *                  what their own people did elsewhere (e.g. a CAS chair
 *                  injecting GEC into CIT shows up for both Deans).
 */
export interface AuditInput {
  /** The signed-in DB user performing the action (as returned by getCurrentUser). */
  actor: { id: string; firstName?: string | null; lastName?: string | null; role: string } & Record<string, any>
  action: AuditAction
  entityType: "schedule" | "entry" | "user" | "faculty" | "subject" | "room" | "building" | "availability"
  entityId?: string | null
  summary: string
  departmentId?: string | null
  scheduleId?: string | null
  metadata?: Record<string, unknown>
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const actorName = `${input.actor.firstName ?? ""} ${input.actor.lastName ?? ""}`.trim() || input.actor.email || "Unknown"
    await db.auditLog.create({
      data: {
        actorId: input.actor.id,
        actorName,
        actorRole: input.actor.role,
        actorDepartmentId: getUserDepartmentId(input.actor),
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
        departmentId: input.departmentId ?? null,
        scheduleId: input.scheduleId ?? null,
        metadata: input.metadata ? (input.metadata as any) : undefined,
      },
    })
  } catch (error) {
    console.error("[audit] failed to record", input.action, error)
  }
}
