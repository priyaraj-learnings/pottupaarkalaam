'use client'

import { useState } from 'react'

import type { LegalDoc } from '@/components/LegalOverlay'
import { LogoMark, Wordmark } from '@/components/Logo'
import { Button, Card, Notice } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import type { Account } from '@/lib/client/types'

// Asked at first sign-in (and again when the terms change), before the first
// try-on. The person must tick that they read the Terms and Privacy Policy.
const POINTS = [
  'I am 18 or older.',
  'The photos I add are of me, or I have that person\'s permission.',
  'My photos and pictures are deleted after 3 days. I will save the ones I want to keep.',
  'Pictures are made by AI as a preview. Real clothes may look different.',
  'Pictures I save or share are my responsibility once they leave the app.',
  'Used credits are not refunded. If a picture fails, its credits come back automatically.',
]

export default function TermsConsent({ updated = false, onAgreed, onSignOut, onOpen }: {
  // The person agreed to an earlier version.
  updated?: boolean
  onAgreed: (account: Account) => void
  onSignOut: () => void
  // Opens the Terms or Privacy Policy over this screen, keeping the tick.
  onOpen: (doc: LegalDoc) => void
}) {
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
      <div className="flex items-center gap-3">
        <LogoMark size={44} />
        <Wordmark />
      </div>
      {updated && <Notice tone="info">We have updated our Terms and Privacy Policy. Please read them and agree again.</Notice>}
      <Card title="Before you start">
        <ul className="space-y-3">
          {POINTS.map(point => (
            <li key={point} className="flex gap-3 text-[15px] text-stone-700">
              <span className="mt-0.5 text-brand-600" aria-hidden="true">✓</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <label className="mt-5 flex items-start gap-3 rounded-2xl bg-brand-50 p-3 text-[15px] text-stone-800 ring-1 ring-brand-100">
          <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
          <span>
            I have read and agree to the{' '}
            <button type="button" onClick={() => onOpen('terms')} className="font-semibold text-brand-700 underline">Terms of Use</button> and{' '}
            <button type="button" onClick={() => onOpen('privacy')} className="font-semibold text-brand-700 underline">Privacy Policy</button>.
          </span>
        </label>
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      <Button busy={busy} disabled={!checked} onClick={agree} className="w-full text-base">I agree</Button>
      {!checked && <p className="-mt-2 text-center text-xs text-stone-500">Tick the box above to continue.</p>}
      <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
    </main>
  )
}
