'use client'

import { useState } from 'react'

import { LanguageSwitch } from '@/components/LanguageSwitch'
import type { LegalDoc } from '@/components/LegalOverlay'
import { LogoMark, Wordmark } from '@/components/Logo'
import { Button, Card, Notice } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { useLanguage } from '@/lib/client/language'
import type { Account } from '@/lib/client/types'
import { CONSENT_SCREEN } from '@/lib/legal'

// Asked at first sign-in, once again whenever the terms change (the server's
// TERMS_VERSION), and once a year (termsDue), before the next try-on. The
// person must tick that they read the Terms and Privacy Policy.

export default function TermsConsent({ reason, onAgreed, onSignOut, onOpen }: {
  reason: 'first' | 'updated' | 'yearly'
  onAgreed: (account: Account) => void
  onSignOut: () => void
  // Opens the Terms or Privacy Policy over this screen, keeping the tick.
  onOpen: (doc: LegalDoc) => void
}) {
  const text = CONSENT_SCREEN[useLanguage()]
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function agree() {
    setBusy(true)
    setError('')
    try {
      const { account } = await api<{ account: Account }>('/api/me', { method: 'POST', json: { acceptTerms: true } })
      onAgreed(account)
    } catch (agreeError) {
      setError(errorMessage(agreeError))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <LogoMark size={44} />
          <Wordmark />
        </span>
        <LanguageSwitch />
      </div>
      {reason === 'updated' && <Notice tone="info">{text.updated}</Notice>}
      {reason === 'yearly' && <Notice tone="info">{text.yearly}</Notice>}
      <Card title={text.title}>
        <ul className="space-y-3">
          {text.points.map(point => (
            <li key={point} className="flex gap-3 text-[15px] text-stone-700">
              <span className="mt-0.5 text-brand-600" aria-hidden="true">✓</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <label className="mt-5 flex items-start gap-3 rounded-2xl bg-brand-50 p-3 text-[15px] text-stone-800 ring-1 ring-brand-100">
          <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
          <span>
            {text.agreeBefore}{' '}
            <button type="button" onClick={() => onOpen('terms')} className="font-semibold text-brand-700 underline">{text.terms}</button> {text.and}{' '}
            <button type="button" onClick={() => onOpen('privacy')} className="font-semibold text-brand-700 underline">{text.privacy}</button>
            {text.agreeAfter === '.' ? '.' : ` ${text.agreeAfter}`}
          </span>
        </label>
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      <Button busy={busy} disabled={!checked} onClick={agree} className="w-full text-base">{text.agree}</Button>
      {!checked && <p className="-mt-2 text-center text-xs text-stone-500">{text.tickFirst}</p>}
      <Button variant="ghost" onClick={onSignOut}>{text.signOut}</Button>
    </main>
  )
}
