import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

// Public endpoint — no auth required. Tells the sign-up form whether an approved
// Department Chair (SUPER_ADMIN) already exists. When none exists, the first
// person to register as Department Chair is auto-approved on first login
// (see the bootstrap logic in ensureDbUser(), lib/auth.ts) — no approver needed.
export async function GET() {
  try {
    const count = await db.user.count({
      where: { role: "SUPER_ADMIN", isApproved: true, isActive: true },
    })
    return NextResponse.json(apiResponse({ superAdminExists: count > 0 }))
  } catch (error) {
    console.error("GET /api/auth/bootstrap-status error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
