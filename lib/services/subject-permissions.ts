import { db } from "@/lib/db"
import { ROLE_LABELS, geUnitOwnsCode, isGeUnitRole, isNstpCode, isPathfitSubjectCode } from "@/lib/roles"

/**
 * Per-cluster GEC/GEL ownership (compliance spec / rule.docx).
 * Each CAS Department Chairperson may only generate or manually manage
 * the GEC codes of their own cluster — across the entire university.
 */
export const CLUSTER_GEC_CODES: Record<string, string[]> = {
  "Social Sciences":                         ["GEC01", "GEC02", "GEC03", "GEC04", "GEC09", "GEL07", "GEL10"],
  "Language, Communication, and Humanities":   ["GEC06", "GEC07", "GEC10", "GEC11", "GEC12", "GEC13", "GEC14"],
  // GEL04/05/08 are the GE electives the CTE / CABHA / CAM curricula use
  // (Living in the IT Era, The Entrepreneurial Mind, Human Reproduction) —
  // seeded into CAS by prisma/seed-curriculum-colleges.ts.
  "Mathematics and Natural Sciences":        ["GEC05", "GEC08", "GEL01", "GEL04", "GEL05", "GEL08"],
}

/**
 * May this user manually add/edit/delete schedule entries for this subject?
 *
 *   PATHFIT / NSTP (the single coordinator accounts) — ONLY their own subject
 *     family (PATHFit0n / NSTPn), in every college's schedule. Nothing else.
 *   SUPER_ADMIN with a cluster — their cluster's GEC codes (university-wide)
 *     and their cluster programs' CAS major subjects. NOT PATHFit / NSTP any
 *     more — those belong to the coordinator accounts above.
 *   SUPER_ADMIN without a cluster — anything except PATHFit / NSTP and other
 *     colleges' majors (fallback super-user).
 *   ADMIN (Program Chair) — their own program's majors and their department's
 *     shared non-GEC subjects. Never GEC/GEL/PATHFit/NSTP.
 *   DEAN — read-only; never edits entries.
 *
 * Returns null when allowed, or a human-readable error message when not.
 */
export async function checkSubjectEditPermission(
  dbUser: any,
  subjectId: string
): Promise<string | null> {
  const subject = await db.subject.findUnique({
    where: { id: subjectId },
    select: {
      code: true,
      type: true,
      programId: true,
      departmentId: true,
      program: {
        select: {
          clusterId: true,
          name: true,
          abbreviation: true,
          department: { select: { college: { select: { abbreviation: true } } } },
        },
      },
      department: { select: { college: { select: { abbreviation: true } } } },
    },
  })
  if (!subject) return "Subject not found"

  const code = subject.code.toUpperCase()

  // CIT laboratory subjects (Section 3 / 4.2): editing authority is EXCLUSIVE to
  // the owning CIT Program Chairperson. No other role — not the Department
  // Chairperson, not another program's chair — may add, edit, move, or delete
  // them. This is checked before every other rule (including the SUPER_ADMIN
  // full-access fallback) so it can never be bypassed.
  const collegeAbbr =
    subject.program?.department?.college?.abbreviation ??
    subject.department?.college?.abbreviation ??
    null
  if (subject.type === "LABORATORY" && collegeAbbr === "CIT") {
    const myProgramId = (dbUser as any).programHead?.programId ?? null
    if (dbUser.role === "ADMIN" && subject.programId && myProgramId === subject.programId) {
      return null
    }
    return `${subject.code} is a CIT laboratory subject — only its own CIT Program Chairperson may edit it.`
  }

  // PATHFit / NSTP: exclusively the matching coordinator account (spec §3).
  if (isPathfitSubjectCode(code) || isNstpCode(code)) {
    if (geUnitOwnsCode(dbUser.role, code)) return null
    const owner = isPathfitSubjectCode(code) ? ROLE_LABELS.PATHFIT : ROLE_LABELS.NSTP
    return `${subject.code} is managed by the ${owner} account only`
  }
  if (isGeUnitRole(dbUser.role)) {
    return `${subject.code} is outside your unit — the ${ROLE_LABELS[dbUser.role as "PATHFIT" | "NSTP"]} account may only schedule ${dbUser.role === "PATHFIT" ? "PATHFit" : "NSTP"} classes`
  }

  if (dbUser.role === "DEAN") {
    return "The Dean has view-only access to schedules"
  }

  if (dbUser.role === "SUPER_ADMIN") {
    // The Department Chairperson may VIEW a Program Chair's major subjects but not edit
    // them (spec Section 3) — EXCEPT in CAS, where the DC holds delegated PC-level
    // access (Section 4.1). So any non-CAS major subject is off-limits to every DC,
    // regardless of whether they have a cluster assigned (this also closes the
    // no-cluster "full-access" hole below for other colleges' majors).
    if (subject.programId && collegeAbbr && collegeAbbr !== "CAS") {
      return `${subject.code} is a major subject of ${subject.program?.abbreviation ?? "another program"} (${collegeAbbr}) — the Department Chairperson can view it, but only its Program Chairperson may edit it.`
    }

    const clusterId = (dbUser as any).clusterId
    if (!clusterId) return null // full-access chair (no cluster assigned) — CAS/GEC territory only

    if (subject.programId) {
      // CAS major subject — must belong to a program in this chair's cluster
      if (subject.program?.clusterId === clusterId) return null
      return `${subject.code} is a major subject of ${subject.program?.abbreviation ?? "another program"} — it is managed by that program's chairperson or department head`
    }

    // GEC/GEL — must be one of this cluster's codes
    const cluster = await db.facultyCluster.findUnique({
      where: { id: clusterId },
      select: { name: true },
    })
    const ownedCodes = CLUSTER_GEC_CODES[cluster?.name ?? ""] ?? []
    if (ownedCodes.some((c) => c.toUpperCase() === code)) return null
    return `${subject.code} is assigned to a different department head — you can only manage: ${ownedCodes.join(", ")}`
  }

  if (dbUser.role === "ADMIN") {
    if (code.startsWith("GEC") || code.startsWith("GEL")) {
      return `${subject.code} is a GEC subject — only the Department Chairperson can schedule it`
    }
    const myProgramId = (dbUser as any).programHead?.programId ?? null
    if (subject.programId) {
      if (subject.programId === myProgramId) return null
      return `${subject.code} belongs to another program — only its own Program Chairperson can modify it`
    }
    // Dept-wide non-GEC subject (e.g. RES/FLO/OJT) — must be the chair's own department
    const myDeptId =
      (dbUser as any).programHead?.program?.departmentId ??
      (dbUser as any).departmentId ??
      null
    if (myDeptId && subject.departmentId === myDeptId) return null
    return `${subject.code} belongs to another department`
  }

  return "Insufficient permissions"
}
