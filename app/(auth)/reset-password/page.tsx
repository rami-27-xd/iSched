'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CalendarDays, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { passwordError } from '@/lib/password'
import { PasswordRequirements } from '@/components/shared/password-requirements'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword]           = useState('')
  const [confirm, setConfirm]             = useState('')
  const [showPw, setShowPw]               = useState(false)
  const [showConfirm, setShowConfirm]     = useState(false)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState('')
  const [done, setDone]                   = useState(false)
  // Supabase puts the recovery token in the URL hash on first load.
  // We need to let the client library exchange it before showing the form.
  const [sessionReady, setSessionReady]   = useState(false)
  const [sessionError, setSessionError]   = useState('')

  useEffect(() => {
    // The Supabase JS client automatically exchanges the #access_token fragment
    // from the reset-password email link into a session. We listen for the
    // PASSWORD_RECOVERY event to know the session is live and the form is safe to submit.
    let supabase
    try {
      supabase = createClient()
    } catch (err: any) {
      setSessionError(err.message)
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Also check if a session already exists (e.g. user refreshed the page)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true)
    })

    return () => { subscription.unsubscribe() }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    const pwError = passwordError(password)
    if (pwError) {
      setError(pwError)
      return
    }

    setLoading(true)

    let supabase
    try {
      supabase = createClient()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setDone(true)
    // Redirect to sign-in after 3 seconds
    setTimeout(() => router.push('/sign-in'), 3000)
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-[#D4AF37] mb-4">
            <ShieldCheck className="h-7 w-7 text-[#1B4332]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Password updated</h1>
          <p className="mt-2 text-sm text-white/60">
            Your password has been changed successfully. Redirecting you to sign in…
          </p>
          <Link
            href="/sign-in"
            className="mt-6 inline-block rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#1B4332] transition-colors hover:bg-[#F0D060]"
          >
            Sign in now
          </Link>
        </div>
      </div>
    )
  }

  // ── Invalid/expired link ───────────────────────────────────────────────────
  if (sessionError) {
    return (
      <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">Configuration error</h1>
          <p className="text-sm text-white/60">{sessionError}</p>
          <Link href="/sign-in" className="inline-block text-sm font-medium text-[#D4AF37] hover:text-[#F0D060]">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  // ── Waiting for Supabase to exchange the token fragment ───────────────────
  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37] mx-auto" />
          <p className="text-sm text-white/60">Verifying your reset link…</p>
          <p className="text-xs text-white/40">
            If this takes too long, your link may have expired.{' '}
            <Link href="/forgot-password" className="text-[#D4AF37] hover:underline">
              Request a new one
            </Link>
          </p>
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37] mb-4">
            <CalendarDays className="h-6 w-6 text-[#1B4332]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Set a new password</h1>
          <p className="mt-1 text-sm text-white/60">Choose a strong password for your account</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* New password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordRequirements password={password} />
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2D6A4F] disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-white/60">
          <Link href="/sign-in" className="font-medium text-[#D4AF37] hover:text-[#F0D060]">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
