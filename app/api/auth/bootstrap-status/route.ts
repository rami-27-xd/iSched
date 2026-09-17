import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

// Public endpoint — no auth required. Tells the sign-up form which accounts are
// auto-approved and which can no longer be created at all (see
// resolveAutoApproval() in lib/auth.ts for the rules):
//
//   superAdminExists   — an approved Department Chair exists. When none does, the
//                        first person to register as Department Chair is
//                        auto-approved (bootstrap).
//   pathfitExists /    — the single PATHFit / NSTP coordinator account already
//   nstpExists           exists; the form must refuse a second one.
//   deanDepartmentIds  — departments that already have their (one) Dean; the form
//                        refuses a second Dean for them and auto-approves the first
//                        Dean of any other department.
export async function GET() {
  try {
    const [superAdmins, pathfit, nstp, deans] = await Promise.all([
      db.user.count({ where: { role: "SUPER_ADMIN", isApproved: true, isActive: true } }),
      db.user.count({ where: { role: "PATHFIT", isApproved: true, isActive: true } }),
      db.user.count({ where: { role: "NSTP", isApproved: true, isActive: true } }),
      db.user.findMany({
        where: { role: "DEAN", isApproved: true, isActive: true, departmentId: { not: null } },
        select: { departmentId: true },
      }),
    ])
    return NextResponse.json(
      apiResponse({
        superAdminExists: superAdmins > 0,
        pathfitExists: pathfit > 0,
        nstpExists: nstp > 0,
        deanDepartmentIds: [...new Set(deans.map((d) => d.departmentId as string))],
      })
    )
  } catch (error) {
    console.error("GET /api/auth/bootstrap-status error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
