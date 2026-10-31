'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'

import { Button, Notice } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { openMsg91Widget } from '@/lib/client/msg91'
import { supabase } from '@/lib/supabase/browser'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  )
}

// The sign-in choices, for the sheet that opens at "Try on" (or "Sign in"):
// mobile number first (one code gives the account, the verified number and
// the free credits), then Google, then email.
export function SignInOptions({ phoneWidget }: { phoneWidget: { widgetId: string; tokenAuth: string } | null }) {
  const [mode, setMode] = useState<'choose' | 'email' | 'code'>('choose')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // The widget confirmed the code: swap its token for a session.
  async function finishPhone(accessToken: string) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      })
      const result = await response.json().catch(() => null) as { tokenHash?: string; type?: 'magiclink'; error?: { message?: string } } | null
      if (!response.ok || !result?.tokenHash) throw new Error(result?.error?.message ?? 'Sign-in did not work. Please try again.')
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: result.type ?? 'magiclink' })
      if (verifyError) throw new Error('Sign-in did not work. Please try again.')
      // Signed in: the app takes over from here.
    } catch (phoneError) {
      setError(errorMessage(phoneError))
      setBusy(false)
    }
  }

  async function mobile() {
    if (!phoneWidget) return
    setError('')
    try {
      await openMsg91Widget(phoneWidget, accessToken => void finishPhone(accessToken), setError)
    } catch (widgetError) {
      setError(errorMessage(widgetError))
    }
  }

  async function google() {
    setBusy(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (signInError) {
      setError('Google sign-in is not available right now. Please use your mobile number or email.')
      setBusy(false)
    }
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/` },
    })
    setBusy(false)
    if (sendError) {
      setError(/rate|seconds/i.test(sendError.message) ? 'Please wait a minute before asking for another code.' : 'The code could not be sent. Check the email address.')
      return
    }
    setMode('code')
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (verifyError) setError('That code is not right or has expired. Please try again.')
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="error">{error}</Notice>}

      {mode === 'choose' && (
        <>
          {phoneWidget && (
            <>
              <Button busy={busy} onClick={mobile} className="w-full text-base">
                <span aria-hidden="true">📱</span> Continue with mobile number
              </Button>
              <p className="-mt-1 text-center text-xs text-stone-500">One SMS code. Your free pictures start straight away.</p>
            </>
          )}
          <Button variant="secondary" busy={busy && !phoneWidget} disabled={busy && Boolean(phoneWidget)} onClick={google} className="w-full text-base">
            <GoogleIcon /> Continue with Google
          </Button>
          <Button variant="ghost" onClick={() => setMode('email')} className="w-full">Use email instead</Button>
        </>
      )}

      {mode === 'email' && (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label className="text-sm font-bold text-stone-700" htmlFor="email">Your email</label>
          <input
            id="email" type="email" required autoComplete="email" inputMode="email" value={email}
            onChange={event => setEmail(event.target.value)}
            className="min-h-12 rounded-2xl border border-stone-300 px-4 text-base outline-none focus:border-brand-500"
            placeholder="you@example.com"
          />
          <Button type="submit" busy={busy} className="w-full">Send me a code</Button>
          <Button variant="ghost" onClick={() => setMode('choose')}>Back</Button>
        </form>
      )}

      {mode === 'code' && (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <p className="text-sm text-stone-600">We sent a code to <b>{email}</b>. It may take a minute; check spam too.</p>
          <label className="text-sm font-bold text-stone-700" htmlFor="code">Code from the email</label>
          <input
            id="code" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" maxLength={8} value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
            className="min-h-14 rounded-2xl border border-stone-300 px-4 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-brand-500"
          />
          <Button type="submit" busy={busy} disabled={code.length < 6} className="w-full">Sign in</Button>
          <Button variant="ghost" onClick={() => { setMode('email'); setCode('') }}>Use a different email</Button>
        </form>
      )}

      <p className="pt-1 text-center text-xs text-stone-500">
        By continuing you agree to our <Link href="/terms" className="font-semibold underline">Terms</Link> and{' '}
        <Link href="/privacy" className="font-semibold underline">Privacy Policy</Link>.
      </p>
    </div>
  )
}

export type SignInOptionsData = { phone: { widgetId: string; tokenAuth: string } | null; freeCreditsPerMonth: number | null }

// The public sign-in options (before anyone is signed in).
export function useSignInOptions(): SignInOptionsData {
  const [options, setOptions] = useState<SignInOptionsData>({ phone: null, freeCreditsPerMonth: null })
  useEffect(() => {
    let cancelled = false
    fetch('/api/sign-in-options', { cache: 'no-store' })
      .then(response => (response.ok ? response.json() : null))
      .then(result => {
        if (cancelled || !result) return
        setOptions({
          phone: result.phone ?? null,
          freeCreditsPerMonth: Number.isInteger(result.freeCreditsPerMonth) ? result.freeCreditsPerMonth : null,
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return options
}
