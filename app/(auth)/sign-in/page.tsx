'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CalendarDays, Loader2, Eye, EyeOff } from 'lucide-react'

export default function SignInPage() {
  const router = useRouter()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [pwError, setPwError]   = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    setPwLoading(true)

    let supabase
    try {
      supabase = createClient()
    } catch (envErr: any) {
      setPwError(envErr.message)
      setPwLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setPwError(
        error.message.toLowerCase().includes('fetch') || error.message === 'Failed to fetch'
          ? 'Cannot reach the authentication server. Check your internet connection and that your Supabase project is not paused.'
          : error.message
      )
      setPwLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogleSignIn() {
    let supabase
    try { supabase = createClient() } catch { return }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/[0.04]" />
        <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/[0.04]" />
        <div className="absolute top-1/4 right-12 h-48 w-48 rounded-full border border-white/[0.07]" />
        <div className="absolute bottom-1/3 left-10 h-28 w-28 rounded-full border border-white/[0.07]" />
        <div className="absolute top-1/3 left-1/4 h-2 w-2 rounded-full bg-[#D4AF37]/50" />
        <div className="absolute top-2/3 right-1/3 h-3 w-3 rounded-full bg-[#D4AF37]/30" />
        <div className="absolute bottom-1/4 left-1/2 h-1.5 w-1.5 rounded-full bg-[#D4AF37]/40" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent" />
      </div>

      <div className="w-full max-w-sm relative z-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37] mb-4">
            <CalendarDays className="h-6 w-6 text-[#1B4332]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Sign in to iSched</h1>
          <p className="mt-1 text-sm text-white/60">Welcome back! Please sign in to continue.</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-xl">
          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="pw-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="pw-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B4332] focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="pw-password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-medium text-[#1B4332] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="pw-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
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
            </div>

            {pwError && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {pwError}
              </p>
            )}

            <button
              type="submit"
              disabled={pwLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2D6A4F] disabled:opacity-50"
            >
              {pwLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-white/60">
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="font-medium text-[#D4AF37] hover:text-[#F0D060]">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
