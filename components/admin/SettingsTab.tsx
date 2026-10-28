'use client'

import { useState, type FormEvent } from 'react'

import type { Overview } from '@/components/admin/types'
import { Button, Card, formatWhen, Notice, Spinner, useToast } from '@/components/ui'
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

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-stone-200 bg-ivory/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Button type="submit" busy={busy} className="w-full sm:w-auto">Save settings</Button>
      </div>
    </form>
  )
}

function PaymentSmsCard({ status }: { status: Overview['paymentSms'] }) {
  const toast = useToast()
  const webhook = typeof window === 'undefined' ? '/api/payments/notify' : `${window.location.origin}/api/payments/notify`
  const state = status.lastAlertAt
    ? { tone: 'success' as const, text: <>Working. Last bank SMS read {formatWhen(status.lastAlertAt)}.</> }
    : status.secretSet
      ? { tone: 'info' as const, text: <>Ready on the app&rsquo;s side, but no bank SMS has arrived yet. Set up the forwarding app on your phone (steps below).</> }
      : { tone: 'warning' as const, text: <>Not set up. Every recharge waits under <b>Payments</b> until you approve it.</> }

  async function copy() {
    try {
      await navigator.clipboard.writeText(webhook)
      toast('Address copied.')
    } catch {
      toast('Could not copy: select the address and copy it.', 'error')
    }
  }

  return (
    <Card title="Automatic payment check (optional)">
      <div className="space-y-3 text-sm text-stone-700">
        <p>
          When a customer pays you by UPI, your bank sends you an SMS. If your phone forwards that SMS here, the app
          reads the amount and the UPI reference (UTR), and when they match what the customer entered, their credits are
          added within seconds, without you approving each one.
        </p>
        <Notice tone={state.tone}>{state.text}</Notice>
        <p className="text-stone-500">
          Bank SMS accepted from: <b className="text-stone-700">{status.senders.length ? status.senders.join(', ') : 'any sender'}</b>
          {!status.senders.length && ' (set _PAYMENT_SMS_SENDERS in the Cloud Build trigger to your bank\'s sender ID, e.g. HDFCBK)'}
        </p>
        <details className="rounded-xl bg-stone-50 p-3">
          <summary className="cursor-pointer font-bold">How to set it up</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>On the Android phone that receives your bank&rsquo;s SMS, install an SMS-forwarding app (for example <i>SMS to URL Forwarder</i>).</li>
            <li>
              Forward only your bank&rsquo;s SMS, as a POST, to:
              <span className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded bg-white px-2 py-1 ring-1 ring-stone-200">{webhook}</code>
                <Button type="button" variant="secondary" onClick={copy} className="min-h-9 shrink-0 text-xs">Copy</Button>
              </span>
            </li>
            <li>Add the header <code className="rounded bg-white px-1 ring-1 ring-stone-200">Authorization: Bearer &lt;PAYMENT_WEBHOOK_SECRET&gt;</code>, using the secret saved in Google Cloud Secret Manager.</li>
            <li>Turn battery optimisation off for that app, so Android doesn&rsquo;t stop it.</li>
          </ol>
          <p className="mt-2 text-stone-500">Full steps and a test: docs/SETUP.md §6.3. Anything that doesn&rsquo;t match exactly still waits for you under Payments.</p>
        </details>
      </div>
    </Card>
  )
}

export default function SettingsTab({ overview, onSaved }: { overview: Overview | null; onSaved: () => void }) {
  if (!overview) return <div className="flex justify-center py-16 text-brand-600"><Spinner className="h-8 w-8" /></div>
  return (
    <div className="space-y-4">
      <SettingsForm key={JSON.stringify(overview.settings) + JSON.stringify(overview.aiRates)} overview={overview} onSaved={onSaved} />
      <PaymentSmsCard status={overview.paymentSms} />
    </div>
  )
}
