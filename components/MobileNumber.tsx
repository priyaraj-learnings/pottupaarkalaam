'use client'

import { useState, type FormEvent } from 'react'

import { LogoMark, Wordmark } from '@/components/Logo'
import { Button, Card, Notice } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import type { Account } from '@/lib/client/types'
import { formatMobile, MOBILE_ASK_AGAIN_DAYS, normalizeMobile } from '@/lib/rules'

// Whether to ask for the mobile number after sign-in: never given, and not
// put off with "Not now" in the last 30 days.
export function shouldAskForMobile(account: Account, now: number) {
  if (account.phone) return false
  if (!account.phoneAskedAt) return true
  return now - new Date(account.phoneAskedAt).getTime() > MOBILE_ASK_AGAIN_DAYS * 86_400_000
}

const savePhone = (json: Record<string, unknown>) => api<{ account: Account }>('/api/me/phone', { method: 'PUT', json })

export function MobileForm({ account, onSaved, onSkip, onCancel }: {
  account: Account
  onSaved: (account: Account) => void
  onSkip?: () => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState(account.phone ? formatMobile(account.phone) : '')
  const [offersOk, setOffersOk] = useState(account.offersOk)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send(json: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      onSaved((await savePhone(json)).account)
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const phone = normalizeMobile(value)
    if (!phone) {
      setError('Enter your 10-digit mobile number.')
      return
    }
    void send({ phone, offersOk })
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm font-bold text-stone-700">
        Mobile number
        <span className="mt-1 flex min-h-12 items-center rounded-xl border border-stone-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <span className="pl-3 pr-1 font-semibold text-stone-500">+91</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={value}
            onChange={event => setValue(event.target.value)}
            placeholder="98765 43210"
            maxLength={16}
            className="min-w-0 flex-1 rounded-xl bg-transparent px-2 text-lg font-normal tracking-wide outline-none"
          />
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm text-stone-700">
        <input type="checkbox" checked={offersOk} onChange={event => setOffersOk(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
        <span>Send me offers and new features on WhatsApp or SMS. I can stop them any time.</span>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} className="flex-1">Save</Button>
        {onSkip && <Button type="button" variant="ghost" disabled={busy} onClick={onSkip}>Not now</Button>}
        {onCancel && <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>}
      </div>
      {account.phone && onCancel && (
        <button type="button" disabled={busy} onClick={() => send({ phone: null })} className="text-sm font-semibold text-red-700 underline">
          Remove my number
        </button>
      )}
    </form>
  )
}

// Shown once after sign-in (and the terms). The number is optional.
export default function MobileAsk({ account, onDone }: { account: Account; onDone: (account: Account) => void }) {
  async function skip() {
    try {
      onDone((await savePhone({ skip: true })).account)
    } catch {
      // Not worth blocking the app over: carry on and ask another time.
      onDone(account)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <LogoMark size={44} />
        <Wordmark />
      </div>
      <Card title="Add your mobile number">
        <p className="mb-4 text-[15px] text-stone-600">
          So we can reach you quickly if a payment or a picture needs sorting out. You can change or remove it any time
          from the account menu.
        </p>
        <MobileForm account={account} onSaved={onDone} onSkip={skip} />
      </Card>
      <p className="px-1 text-xs text-stone-500">We never sell or share your number. Offers only if you tick the box.</p>
    </main>
  )
}
