import { db } from "@/lib/db"

/**
 * Per-cluster GEC/GEL ownership (compliance spec / rule.docx).
 * Each CAS Department Chairperson may only generate or manually manage
 * the GEC codes of their own cluster — across the entire university.
 */
export const CLUSTER_GEC_CODES: Record<string, string[]> = {
  "Social Sciences":                         ["GEC01", "GEC02", "GEC03", "GEC04", "GEC09", "GEL07", "GEL10"],
  "Languages, Literature, and Humanities":   ["GEC06", "GEC07", "GEC10", "GEC11", "GEC12", "GEC13", "GEC14"],
  "Mathematics and Natural Sciences":        ["GEC05", "GEC08", "GEL01"],
}

// NSTP/PATHFit are manually scheduled — any Department Chairperson may place them.
const MANUAL_PREFIXES = ["NSTP", "NST", "PATHFIT"]

/**
 * May this user manually add/edit/delete schedule entries for this subject?
 *
 *   SUPER_ADMIN with a cluster — their cluster's GEC codes (university-wide),
 *     their cluster programs' major subjects, and NSTP/PATHFit.
 *   SUPER_ADMIN without a cluster — anything (fallback super-user).
 *   ADMIN (Program Chair) — their own program's majors and their department's
 *     shared non-GEC subjects. Never GEC/GEL (Dept Chair territory).
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

  if (MANUAL_PREFIXES.some((p) => code.startsWith(p))) {
    // NSTP/PATHFit: Dept Chairs only (manual scheduling responsibility)
    return dbUser.role === "SUPER_ADMIN"
      ? null
      : `${subject.code} is manually scheduled by the Department Chairperson`
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
      return `${subject.code} is a major subject of ${subject.program?.abbreviation ?? "another program"} — it is managed by that program's chair or cluster head`
    }

    // GEC/GEL — must be one of this cluster's codes
    const cluster = await db.facultyCluster.findUnique({
      where: { id: clusterId },
      select: { name: true },
    })
    const ownedCodes = CLUSTER_GEC_CODES[cluster?.name ?? ""] ?? []
    if (ownedCodes.some((c) => c.toUpperCase() === code)) return null
    return `${subject.code} is assigned to a different cluster head — you can only manage: ${ownedCodes.join(", ")}`
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
