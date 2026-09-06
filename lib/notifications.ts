import { db } from "@/lib/db"

export type NotificationType =
  | "schedule_published"
  | "schedule_generated"
  | "user_approved"
  | "user_registered"
  | "faculty_added"
  | "faculty_request"
  | "conflict_detected"
  | "workflow_submitted"
  | "workflow_approved"
  | "workflow_rejected"
  | "lab_change_requested"
  | "lab_change_updated"
  | "general"

export async function createNotification({
  userId,
  title,
  message,
  type,
  link,
}: {
  userId: string
  title: string
  message: string
  type: NotificationType
  link?: string
}) {
  return db.notification.create({
    data: { userId, title, message, type, link },
  })
}

/**
 * Notifies every chairperson responsible for a department — the Department
 * Chairperson(s) plus the Program Chairpersons of its programs.
 *
 * A department's chairs are reachable through three different relations
 * (User.departmentId, DepartmentChair, ProgramHead → Program.departmentId), which
 * is why this can't be a single `where`. Used for cross-department scheduling
 * conflicts, where BOTH sides own the problem: they share the room or the
 * lecturer, so neither can fix it alone.
 *
 * `excludeUserId` skips the person who triggered the action — they get their own,
 * differently-worded notification and shouldn't be told twice.
 */
export async function notifyDepartmentChairs(
  departmentId: string,
  { title, message, type, link }: { title: string; message: string; type: NotificationType; link?: string },
  opts: { excludeUserId?: string } = {}
): Promise<number> {
  if (!departmentId) return 0

  const chairs = await db.user.findMany({
    where: {
      isApproved: true,
      isActive: true,
      OR: [
        { role: "SUPER_ADMIN", departmentId },
        { role: "SUPER_ADMIN", departmentChair: { departmentId } },
        { role: "ADMIN", programHead: { program: { departmentId } } },
      ],
    },
    select: { id: true },
  })

  const targets = chairs.map((c) => c.id).filter((id) => id !== opts.excludeUserId)
  if (targets.length === 0) return 0

  await db.notification.createMany({
    data: targets.map((userId) => ({ userId, title, message, type, link })),
  })
  return targets.length
}

export async function notifyAllSuperAdmins(title: string, message: string, type: NotificationType, link?: string) {
  const admins = await db.user.findMany({
    where: { role: "SUPER_ADMIN", isApproved: true, isActive: true },
    select: { id: true },
  })

  if (admins.length === 0) return

  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title,
      message,
      type,
      link,
    })),
  })
}
