'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CalendarDays, Loader2, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/[0.04]" />
        <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/[0.04]" />
        <div className="absolute top-1/4 right-12 h-40 w-40 rounded-full border border-white/[0.07]" />
        <div className="absolute top-1/3 left-1/4 h-2 w-2 rounded-full bg-[#D4AF37]/50" />
        <div className="absolute bottom-1/3 right-1/3 h-2.5 w-2.5 rounded-full bg-[#D4AF37]/35" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent" />
      </div>
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37] mb-4">
            <CalendarDays className="h-6 w-6 text-[#1B4332]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Reset your password</h1>
          <p className="mt-1 text-sm text-white/60">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-xl">
          {sent ? (
            <div className="text-center space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 text-xl">
                ✓
              </div>
              <p className="text-sm font-medium text-gray-800">Check your email</p>
              <p className="text-xs text-gray-500">
                We sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the instructions.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@slsu.edu.ph"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2D6A4F] disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset link
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-white/60">
          <Link href="/sign-in" className="inline-flex items-center gap-1 font-medium text-[#D4AF37] hover:text-[#F0D060]">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
