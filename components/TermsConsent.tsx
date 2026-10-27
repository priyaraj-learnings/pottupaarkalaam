'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Wordmark, LogoMark } from '@/components/Logo'
import { Button, Card, Notice } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import type { Account } from '@/lib/client/types'

// Asked once (and again when the terms change), before the first try-on.
const POINTS = [
  'I am 18 or older.',
  'The photos I add are of me, or I have that person\'s permission.',
  'My photos and pictures are deleted after 3 days. I will save the ones I want to keep.',
  'Pictures are made by AI as a preview. Real clothes may look different.',
  'Used credits are not refunded. If a picture fails, its credits come back automatically.',
]

export default function TermsConsent({ onAgreed, onSignOut }: { onAgreed: (account: Account) => void; onSignOut: () => void }) {
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
      <Card title="Before you start">
        <ul className="space-y-3">
          {POINTS.map(point => (
            <li key={point} className="flex gap-3 text-[15px] text-stone-700">
              <span className="mt-0.5 text-brand-600" aria-hidden="true">✓</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-stone-500">
          Read the full <Link href="/terms" className="font-semibold text-brand-700 underline">Terms</Link> and{' '}
          <Link href="/privacy" className="font-semibold text-brand-700 underline">Privacy Policy</Link>.
        </p>
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      <Button busy={busy} onClick={agree} className="w-full text-base">I agree</Button>
      <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
    </main>
  )
}
