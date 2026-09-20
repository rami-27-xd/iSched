import { db } from "@/lib/db"

/**
 * The general-education department (CAS): its faculty teach GEC/GEL in EVERY
 * college's schedule, so "a scheduling run this department takes part in" is
 * any department's schedule — not only its own. Every other department's
 * faculty only ever appear in that department's own schedule.
 */
export async function isGeneralEducationDepartment(departmentId: string): Promise<boolean> {
  const dept = await db.department.findUnique({
    where: { id: departmentId },
    select: { college: { select: { abbreviation: true } } },
  })
  return dept?.college?.abbreviation === "CAS"
}

/**
 * Whether the term has a non-archived schedule this department's faculty can
 * be scheduled into. Per-term availability / building access are recorded
 * against such a run (see POST /api/faculty/availability).
 */
export async function departmentHasScheduleForTerm(departmentId: string | null | undefined, semesterId: string): Promise<boolean> {
  const generalEducation = departmentId ? await isGeneralEducationDepartment(departmentId) : false
  const found = await db.schedule.findFirst({
    where: { semesterId, isArchived: false, ...(departmentId && !generalEducation ? { departmentId } : {}) },
    select: { id: true },
  })
  return !!found
}
