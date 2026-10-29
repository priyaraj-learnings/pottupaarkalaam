'use client'

import { useState, type FormEvent } from 'react'

import type { Overview } from '@/components/admin/types'
import { Button, Card, formatWhen, Notice, Spinner, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { gmailForwarderScript } from '@/lib/gmailForwarder'

// MSG91 widget IDs are long codes such as 34686b716a33363035353831, never a
// name with spaces or without digits.
const looksLikeWidgetId = (value: string) => /^[A-Za-z0-9]{12,}$/.test(value.trim()) && /\d/.test(value)

function SettingsForm({ overview, onSaved }: { overview: Overview; onSaved: () => void }) {
  const toast = useToast()
  const { settings, aiRates, phoneLogin } = overview
  const [form, setForm] = useState<Record<string, string>>({
    upiId: settings.upiId ?? '',
    payeeName: settings.payeeName ?? '',
    supportContact: settings.supportContact ?? '',
    ...Object.fromEntries(Object.entries(settings.pricing).map(([key, value]) => [key, String(value)])),
    ...Object.fromEntries(Object.entries(aiRates).map(([key, value]) => [key, String(value)])),
    msg91WidgetId: phoneLogin.widgetId,
    msg91TokenAuth: phoneLogin.tokenAuth,
    msg91AuthKey: '',
    freeNeedsMobile: String(phoneLogin.freeNeedsMobile),
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

      <Card title="Mobile number sign-in (MSG91)">
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            Adds &ldquo;Sign in with mobile number&rdquo; to the sign-in screen, using your MSG91 OTP widget (MSG91 → OTP →
            Widgets): MSG91 sends and checks the code. The same widget verifies the numbers of Google and email accounts.
          </p>
          <Notice tone={phoneLogin.widgetId && phoneLogin.tokenAuth && phoneLogin.authKeySet ? 'success' : 'info'}>
            {phoneLogin.widgetId && phoneLogin.tokenAuth && phoneLogin.authKeySet
              ? 'On: customers can sign in with their mobile number.'
              : 'Off: fill in all three to turn it on. Clear the Widget ID to turn it off.'}
          </Notice>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('msg91WidgetId', 'Widget ID', { autoComplete: 'off', autoCapitalize: 'none', spellCheck: 'false', placeholder: 'e.g. 34686b716a33363035353831' })}
            {field('msg91TokenAuth', 'Widget token (tokenAuth)', { autoComplete: 'off', autoCapitalize: 'none', spellCheck: 'false' })}
            {field('msg91AuthKey', `Auth key${phoneLogin.authKeySet ? ' (saved; type a new one to replace it)' : ''}`, {
              type: 'password', autoComplete: 'new-password', placeholder: phoneLogin.authKeySet ? '••••••••' : 'From MSG91 → Authkey',
            })}
          </div>
          <p className="text-xs text-stone-500">
            Copy the Widget ID and token from MSG91 → OTP Widget/SDK → Widgets → your widget → <b>Client Side Integration</b>:
            the values in quotes after <code>widgetId:</code> and <code>tokenAuth:</code>. The Auth key is under MSG91 → Authkey.
          </p>
          {form.msg91WidgetId.trim() && !looksLikeWidgetId(form.msg91WidgetId) && (
            <Notice tone="warning">
              That looks like the widget&rsquo;s name. The Widget ID is a long code (letters and numbers, no spaces) from
              Client Side Integration; MSG91 answers &ldquo;Widget not found&rdquo; to a name.
            </Notice>
          )}
          <label className="flex items-start gap-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
            <input type="checkbox" checked={form.freeNeedsMobile === 'true'} onChange={event => setForm(current => ({ ...current, freeNeedsMobile: String(event.target.checked) }))}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
            <span>
              <b>Free credits only for a verified mobile number.</b> Everyone who signs in with Google or email must verify a
              number with an SMS code, and one number can belong to one account only, so the free credits go to one number
              a month. Needs the three boxes above.
            </span>
          </label>
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
    ? { tone: 'success' as const, text: <>Working. Last bank alert read {formatWhen(status.lastAlertAt)}.</> }
    : status.secretSet
      ? { tone: 'info' as const, text: <>Ready on the app&rsquo;s side, but no bank alert has arrived yet. Set up one of the two ways below.</> }
      : { tone: 'warning' as const, text: <>Not set up. Every recharge waits under <b>Payments</b> until you approve it.</> }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copied.`)
    } catch {
      toast('Could not copy: select it and copy it.', 'error')
    }
  }

  const code = 'rounded bg-white px-1 ring-1 ring-stone-200'

  return (
    <Card title="Automatic payment check (optional)">
      <div className="space-y-3 text-sm text-stone-700">
        <p>
          When a customer pays you by UPI, your bank sends you an email (and, for bigger amounts, an SMS). If that alert is
          passed on to the app, it reads the amount and the UPI reference (UTR), and when they match what the customer
          entered, their credits are added at once, without you approving each one.
        </p>
        <Notice tone={state.tone}>{state.text}</Notice>
        <p className="text-stone-500">
          Alerts accepted from: <b className="text-stone-700">{status.senders.length ? status.senders.join(', ') : 'any sender'}</b>
          {' '}(set <code className={code}>_PAYMENT_SMS_SENDERS</code> in the Cloud Build trigger to limit it, e.g. <code className={code}>HDFCBK,HDFCBANK.NET</code>)
        </p>

        <details className="rounded-xl bg-stone-50 p-3">
          <summary className="cursor-pointer font-bold">Way 1 (recommended): bank alert emails, through Gmail</summary>
          <p className="mt-2 text-stone-600">
            Works for every amount (many banks send no SMS for small UPI credits; HDFC, for example, only from ₹500) and
            needs no phone. A small script in the Gmail account that gets your bank&rsquo;s alerts passes them on every minute.
          </p>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>Make sure your bank emails you for every UPI credit (bank app or net banking → alerts), to a Gmail address.</li>
            <li>Signed in to that Gmail, open <b>script.google.com</b> → <b>New project</b>, delete what is there, and paste this script:
              <Button type="button" variant="secondary" onClick={() => copy(gmailForwarderScript(webhook), 'Script')} className="ml-2 min-h-9 text-xs">Copy script</Button>
            </li>
            <li>In the script, change <code className={code}>BANK_EMAIL</code> to the address your bank&rsquo;s alert emails come from.</li>
            <li><b>Project Settings</b> (gear) → <b>Script properties</b> → add <code className={code}>PP_SECRET</code> = your PAYMENT_WEBHOOK_SECRET (Google Cloud → Secret Manager).</li>
            <li>Press <b>Run</b> once and allow access. Then <b>Triggers</b> (clock) → <b>Add trigger</b> → <i>forwardBankAlerts</i>, Time-driven, Every minute.</li>
          </ol>
        </details>

        <details className="rounded-xl bg-stone-50 p-3">
          <summary className="cursor-pointer font-bold">Way 2: bank SMS, from an Android phone</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>On the Android phone that receives your bank&rsquo;s SMS, install an SMS-forwarding app (for example <i>SMS to URL Forwarder</i>).</li>
            <li>
              Forward only your bank&rsquo;s SMS, as a POST, to:
              <span className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded bg-white px-2 py-1 ring-1 ring-stone-200">{webhook}</code>
                <Button type="button" variant="secondary" onClick={() => copy(webhook, 'Address')} className="min-h-9 shrink-0 text-xs">Copy</Button>
              </span>
            </li>
            <li>Add the header <code className={code}>Authorization: Bearer &lt;PAYMENT_WEBHOOK_SECRET&gt;</code>.</li>
            <li>Turn battery optimisation off for that app, so Android doesn&rsquo;t stop it.</li>
          </ol>
        </details>

        <p className="text-stone-500">
          If no alert arrives (or it doesn&rsquo;t match exactly), the recharge simply waits under <b>Payments</b>: check your
          bank app and approve it. Full steps and a test: docs/SETUP.md §6.3.
        </p>
      </div>
    </Card>
  )
}

export default function SettingsTab({ overview, onSaved }: { overview: Overview | null; onSaved: () => void }) {
  if (!overview) return <div className="flex justify-center py-16 text-brand-600"><Spinner className="h-8 w-8" /></div>
  return (
    <div className="space-y-4">
      <SettingsForm key={JSON.stringify(overview.settings) + JSON.stringify(overview.aiRates) + JSON.stringify(overview.phoneLogin)} overview={overview} onSaved={onSaved} />
      <PaymentSmsCard status={overview.paymentSms} />
    </div>
  )
}
