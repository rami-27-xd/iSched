import { db } from "@/lib/db"

/**
 * Workflow gate (Workflow Guide steps 4–5): the Department Chairperson plots
 * GEC/GEL FIRST; Program Chairs may only add their major load once that
 * backbone exists in the schedule. "GEC exists" is the signal — there is no
 * separate status for it. The one exception is the CIT laboratory pre-plot
 * (step 1), which happens BEFORE GEC on purpose.
 */
export async function scheduleHasGec(scheduleId: string): Promise<boolean> {
  const n = await db.scheduleEntry.count({
    where: {
      scheduleId,
      OR: [
        { subject: { code: { startsWith: "GEC" } } },
        { subject: { code: { startsWith: "GEL" } } },
      ],
    },
  })
  return n > 0
}

export const GEC_FIRST_MESSAGE =
  "The Department Chairperson has not generated the GEC/GEL schedule for this term yet (Workflow step 2–4). Program Chairs add their major subjects only after GEC/GEL is in place."
