'use client'

import { useState, type FormEvent } from 'react'

import type { Overview } from '@/components/admin/types'
import { Button, Card, Notice, Spinner, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'

function SettingsForm({ overview, onSaved }: { overview: Overview; onSaved: () => void }) {
  const toast = useToast()
  const { settings, aiRates } = overview
  const [form, setForm] = useState<Record<string, string>>({
    upiId: settings.upiId ?? '',
    payeeName: settings.payeeName ?? '',
    supportContact: settings.supportContact ?? '',
    ...Object.fromEntries(Object.entries(settings.pricing).map(([key, value]) => [key, String(value)])),
    ...Object.fromEntries(Object.entries(aiRates).map(([key, value]) => [key, String(value)])),
  })
  const [busy, setBusy] = useState(false)

  const field = (key: string, label: string, props: Record<string, string> = {}) => (
    <label className="block text-sm font-bold text-stone-700">
      {label}
      <input value={form[key] ?? ''} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}
        className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" {...props} />
    </label>
  )

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await api('/api/admin', { method: 'PATCH', json: form })
      toast('Settings saved.')
      onSaved()
    } catch (saveError) {
      toast(errorMessage(saveError), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card title="Where customers pay">
        <div className="space-y-3">
          {!settings.upiId && <Notice tone="warning">No UPI ID yet: customers see &ldquo;Recharge is opening soon&rdquo; instead of the pay button and QR.</Notice>}
          <Notice tone="info">Use inaivu IT&rsquo;s <b>business</b> UPI ID. After saving, make a ₹50 test recharge from your own phone and check the money reaches the right account.</Notice>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('upiId', 'UPI ID', { placeholder: 'inaivuit@okaxis', autoComplete: 'off', autoCapitalize: 'none' })}
            {field('payeeName', 'Payee name (shown in the UPI app)', { placeholder: 'inaivu IT' })}
            {field('supportContact', 'Help contact shown to customers', { placeholder: 'WhatsApp 9xxxxxxxxx or email' })}
          </div>
        </div>
      </Card>

      <Card title="Prices and free credits">
        <div className="grid gap-3 sm:grid-cols-2">
          {field('freeCreditsPerMonth', 'Free credits a month', { inputMode: 'numeric' })}
          {field('standardRateInr', 'Price per credit (₹)', { inputMode: 'numeric' })}
          {field('bulkRateInr', 'Bulk price per credit (₹)', { inputMode: 'numeric' })}
          {field('bulkMinRechargeInr', 'Bulk price from a recharge of (₹)', { inputMode: 'numeric' })}
          {field('minRechargeInr', 'Smallest recharge (₹)', { inputMode: 'numeric' })}
          {field('maxRechargeInr', 'Largest recharge (₹)', { inputMode: 'numeric' })}
        </div>
      </Card>

      <Card title="AI prices (for the cost reports)">
        <p className="mb-3 text-sm text-stone-500">
          From openai.com/api/pricing for the image model in use (US dollars per 1 million tokens). Every report is
          recalculated from the tokens OpenAI reported when you change these.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('textInputUsdPerMillion', 'Text input ($ per 1M tokens)', { inputMode: 'decimal' })}
          {field('imageInputUsdPerMillion', 'Image input ($ per 1M tokens)', { inputMode: 'decimal' })}
          {field('outputUsdPerMillion', 'Image output ($ per 1M tokens)', { inputMode: 'decimal' })}
          {field('usdToInr', 'Rupees per US dollar', { inputMode: 'decimal' })}
        </div>
      </Card>

      <Button type="submit" busy={busy} className="w-full sm:w-auto">Save settings</Button>
    </form>
  )
}

function CreditsForm() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [credits, setCredits] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function give(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ credits: number }>('/api/admin/credits', { method: 'POST', json: { email, credits: Number(credits), reason } })
      toast(`Done. They now have ${result.credits} paid credits.`)
      setEmail('')
      setCredits('')
      setReason('')
    } catch (giveError) {
      toast(errorMessage(giveError), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={give} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
      <input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Customer email" aria-label="Customer email" className="min-h-11 rounded-xl border border-stone-300 px-3" />
      <input required inputMode="numeric" value={credits} onChange={event => setCredits(event.target.value.replace(/[^\d-]/g, ''))} placeholder="Credits (-5 takes back)" aria-label="Credits" className="min-h-11 rounded-xl border border-stone-300 px-3" />
      <input required value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason" aria-label="Reason" className="min-h-11 rounded-xl border border-stone-300 px-3" />
      <Button type="submit" busy={busy} className="min-h-11">Give</Button>
    </form>
  )
}

export default function SettingsTab({ overview, onSaved }: { overview: Overview | null; onSaved: () => void }) {
  if (!overview) return <div className="flex justify-center py-16 text-brand-600"><Spinner className="h-8 w-8" /></div>
  const webhook = typeof window === 'undefined' ? '/api/payments/notify' : `${window.location.origin}/api/payments/notify`
  return (
    <div className="space-y-4">
      <SettingsForm key={JSON.stringify(overview.settings) + JSON.stringify(overview.aiRates)} overview={overview} onSaved={onSaved} />
      <Card title="Give credits">
        <p className="mb-2 text-sm text-stone-500">For a bad picture, a payment entered wrongly, or a goodwill gift. A minus number takes credits back.</p>
        <CreditsForm />
      </Card>
      <Card title="Automatic payment verification">
        <p className="text-sm text-stone-600">
          Bank credit SMS forwarded to <code className="select-all break-all rounded bg-stone-100 px-1">{webhook}</code> with the header
          {' '}<code className="rounded bg-stone-100 px-1">Authorization: Bearer &lt;PAYMENT_WEBHOOK_SECRET&gt;</code> approve matching recharges at once.
          Steps: docs/SETUP.md §6.3.
        </p>
      </Card>
    </div>
  )
}
