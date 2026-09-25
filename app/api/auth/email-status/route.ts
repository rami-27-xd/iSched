import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

// Public endpoint — no auth required. The sign-up form asks it before creating
// an account so someone who already has one is told so up front. Supabase's own
// duplicate signal is unreliable (a fake success with empty `identities` only for
// confirmed password accounts; nothing at all for an account created with Google),
// so the app's own User table is the source of truth here.
//
// Faculty records are stubs (supabaseId "manual-…") and cannot log in — an email
// that only belongs to one of them is NOT an existing account.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!email) return NextResponse.json(apiError("Email is required"), { status: 400 })

    const user = await db.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        NOT: { supabaseId: { startsWith: "manual-" } },
      },
      select: { id: true },
    })
    return NextResponse.json(apiResponse({ exists: !!user }))
  } catch (error) {
    console.error("POST /api/auth/email-status error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
