"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, MailCheck, UserCheck } from "lucide-react"

// One-time notice after /auth/callback (see app/auth/callback/route.ts), carried
// as ?notice= on the dashboard URL:
//   google_ready     — first Continue with Google: account created, email confirmed
//   email_confirmed  — the confirmation link of a password sign-up was opened
//   existing_account — Continue with Google on the sign-up page for an email that
//                      already has an account (signed in to it, role unchanged)
// The "Continue" button closes it and strips the parameter from the URL so a
// reload doesn't show it again.
type Notice = "google_ready" | "email_confirmed" | "existing_account"

export function AuthNotice({ email, isApproved }: { email: string; isApproved: boolean }) {
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("notice")
    if (value === "google_ready" || value === "email_confirmed" || value === "existing_account") {
      setNotice(value)
    }
  }, [])

  if (!notice) return null

  function close() {
    setNotice(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("notice")
    window.history.replaceState(null, "", url.pathname + url.search + url.hash)
  }

  const pendingLine = isApproved
    ? null
    : "Your account is waiting for approval from your department's Dean — you'll be able to use iSched once it's approved."

  const content =
    notice === "existing_account"
      ? {
          icon: UserCheck,
          title: "You already have an account",
          body: (
            <>
              An iSched account already exists for <strong className="text-gray-900">{email}</strong>, so we signed you
              in to it. Your role and department were not changed.
            </>
          ),
          extra: pendingLine,
        }
      : notice === "google_ready"
        ? {
            icon: CheckCircle2,
            title: "You're all set!",
            body: (
              <>
                Signed in with Google as <strong className="text-gray-900">{email}</strong>. Your email is confirmed.
              </>
            ),
            extra: pendingLine,
          }
        : {
            icon: MailCheck,
            title: "Email confirmed",
            body: (
              <>
                Thanks — <strong className="text-gray-900">{email}</strong> is confirmed and your account is ready.
              </>
            ),
            extra: pendingLine,
          }
  const Icon = content.icon

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37]">
          <Icon className="h-6 w-6 text-[#1B4332]" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{content.title}</h2>
        <p className="mt-2 text-sm text-gray-600">{content.body}</p>
        {content.extra && <p className="mt-2 text-sm text-gray-600">{content.extra}</p>}
        <button
          type="button"
          onClick={close}
          autoFocus
          className="mt-5 w-full rounded-lg bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2D6A4F]"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
