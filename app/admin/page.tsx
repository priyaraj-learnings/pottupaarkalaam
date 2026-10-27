'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { LogoMark, Wordmark } from '@/components/Logo'
import { Button, Card, formatInr, formatWhen, Notice, Spinner, ToastProvider, useToast } from '@/components/ui'
import { api, ApiFailure, errorMessage } from '@/lib/client/api'
import type { AppSettings } from '@/lib/client/types'
import { customerCode } from '@/lib/upi'

type Recharge = {
  id: string
  user_id: string | null
  user_email: string | null
  amount_inr: number
  credits: number
  utr: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  auto_verified: boolean
  created_at: string
  reviewed_at: string | null
  rejection_reason: string | null
  bank_amount_inr?: number | null
}

type Overview = {
  settings: AppSettings
  stats: Record<string, number>
  pending: Recharge[]
  recent: Recharge[]
  unmatchedAlerts: Array<{ id: string; utr: string; amount_inr: number; sender: string | null; message: string | null; received_at: string }>
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  )
}

function PendingRow({ recharge, onDone }: { recharge: Recharge; onDone: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const bank = recharge.bank_amount_inr
  const matches = bank !== null && bank !== undefined && Number(bank) === recharge.amount_inr

  async function review(decision: 'APPROVE' | 'REJECT') {
    setBusy(true)
    try {
      await api(`/api/admin/recharges/${recharge.id}`, { method: 'POST', json: { decision, reason } })
      toast(decision === 'APPROVE' ? `Approved: ${recharge.credits} credits added.` : 'Rejected.')
      onDone()
    } catch (reviewError) {
      toast(errorMessage(reviewError), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{recharge.user_email ?? 'Deleted user'}</p>
          <p className="text-xs text-stone-500">
            Code {recharge.user_id ? customerCode(recharge.user_id) : '—'} · {formatWhen(recharge.created_at)}
          </p>
        </div>
        <p className="text-xl font-black">{formatInr(recharge.amount_inr)} <span className="text-sm font-semibold text-stone-500">→ {recharge.credits} credits</span></p>
      </div>
      <p className="text-sm">UTR <code className="select-all rounded bg-stone-100 px-1.5 py-0.5 font-mono">{recharge.utr}</code></p>
      <p className={`text-sm font-semibold ${bank == null ? 'text-stone-500' : matches ? 'text-emerald-700' : 'text-red-700'}`}>
        {bank == null ? 'No bank alert for this UTR yet: check your bank app.' : matches ? 'Bank alert matches.' : `Bank alert says ${formatInr(Number(bank))}.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={() => review('APPROVE')} className="min-h-10 text-sm">Approve</Button>
        <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason (if rejecting)"
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-stone-300 px-3 text-sm" />
        <Button variant="danger" busy={busy} onClick={() => review('REJECT')} className="min-h-10 text-sm">Reject</Button>
      </div>
    </li>
  )
}

function SettingsForm({ settings, onSaved }: { settings: AppSettings; onSaved: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    upiId: settings.upiId ?? '',
    payeeName: settings.payeeName ?? '',
    supportContact: settings.supportContact ?? '',
    ...Object.fromEntries(Object.entries(settings.pricing).map(([key, value]) => [key, String(value)])),
  } as Record<string, string>)
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
    <form onSubmit={save} className="space-y-3">
      <Notice tone="warning">Use inaivu IT&rsquo;s <b>business</b> UPI ID. Check that a test payment reaches the right account after any change.</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('upiId', 'UPI ID', { placeholder: 'inaivuit@okaxis', autoComplete: 'off' })}
        {field('payeeName', 'Payee name', { placeholder: 'inaivu IT' })}
        {field('supportContact', 'Help contact shown to customers', { placeholder: 'WhatsApp 9xxxxxxxxx or email' })}
        {field('freeCreditsPerMonth', 'Free credits a month', { inputMode: 'numeric' })}
        {field('standardRateInr', 'Price per credit (₹)', { inputMode: 'numeric' })}
        {field('bulkRateInr', 'Bulk price per credit (₹)', { inputMode: 'numeric' })}
        {field('bulkMinRechargeInr', 'Bulk price from recharge of (₹)', { inputMode: 'numeric' })}
        {field('minRechargeInr', 'Smallest recharge (₹)', { inputMode: 'numeric' })}
        {field('maxRechargeInr', 'Largest recharge (₹)', { inputMode: 'numeric' })}
      </div>
      <Button type="submit" busy={busy}>Save settings</Button>
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
      <input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Customer email" className="min-h-11 rounded-xl border border-stone-300 px-3" />
      <input required inputMode="numeric" value={credits} onChange={event => setCredits(event.target.value.replace(/[^\d-]/g, ''))} placeholder="Credits (-5 takes back)" className="min-h-11 rounded-xl border border-stone-300 px-3" />
      <input required value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason" className="min-h-11 rounded-xl border border-stone-300 px-3" />
      <Button type="submit" busy={busy} className="min-h-11">Give</Button>
    </form>
  )
}

function AdminConsole() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<{ message: string; signIn?: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      setOverview(await api<Overview>('/api/admin'))
      setError(null)
    } catch (loadError) {
      setError({ message: errorMessage(loadError), signIn: loadError instanceof ApiFailure && loadError.status === 401 })
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(load, 0)
    // New recharges and bank alerts arrive all day.
    const timer = setInterval(load, 60_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [load])

  if (error && !overview) {
    return (
      <div className="space-y-3">
        <Notice tone="error">{error.message}</Notice>
        {error.signIn && <Link href="/" className="font-bold text-brand-700 underline">Sign in first</Link>}
      </div>
    )
  }
  if (!overview) return <div className="flex justify-center py-16 text-brand-600"><Spinner className="h-8 w-8" /></div>

  const { stats } = overview
  const avgCost = stats.pictures ? Number(stats.aiCostInr) / stats.pictures : 0
  const webhook = typeof window === 'undefined' ? '/api/payments/notify' : `${window.location.origin}/api/payments/notify`

  return (
    <div className="space-y-4">
      <Card title="This month">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Customers" value={stats.users} hint={`${stats.newUsers} new`} />
          <Stat label="Pictures" value={stats.pictures} hint={`${stats.failedPictures} failed (refunded)`} />
          <Stat label="Credits used" value={Number(stats.freeCreditsUsed) + Number(stats.paidCreditsUsed)} hint={`${stats.freeCreditsUsed} free · ${stats.paidCreditsUsed} paid`} />
          <Stat label="Recharged" value={formatInr(Number(stats.rechargedInr))} hint={`${stats.autoVerifiedRecharges} verified automatically`} />
          <Stat label="AI cost" value={formatInr(Math.round(Number(stats.aiCostInr)))} hint={`≈ ₹${avgCost.toFixed(2)} a picture (estimate)`} />
          <Stat label="Waiting" value={stats.pendingRecharges} hint="recharges to check" />
          <Stat label="Bank alerts" value={stats.unmatchedAlerts} hint="not claimed yet" />
        </div>
      </Card>

      <Card title={`Recharges to check (${overview.pending.length})`}>
        {overview.pending.length === 0
          ? <p className="text-sm text-stone-500">Nothing waiting.</p>
          : <ul className="divide-y divide-stone-100">{overview.pending.map(recharge => <PendingRow key={recharge.id} recharge={recharge} onDone={load} />)}</ul>}
      </Card>

      <Card title="Bank credits nobody has claimed">
        <p className="mb-2 text-sm text-stone-500">Payments your bank reported that no customer has entered yet. They are matched automatically when the customer enters the UTR.</p>
        {overview.unmatchedAlerts.length === 0 ? <p className="text-sm text-stone-500">None.</p> : (
          <ul className="divide-y divide-stone-100 text-sm">
            {overview.unmatchedAlerts.map(alert => (
              <li key={alert.id} className="py-2">
                <b>{formatInr(Number(alert.amount_inr))}</b> · UTR <code className="font-mono">{alert.utr}</code> · {formatWhen(alert.received_at)}
                <span className="block truncate text-xs text-stone-500">{alert.sender} · {alert.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Give credits">
        <p className="mb-2 text-sm text-stone-500">For a bad picture, a payment entered wrongly, or a goodwill gift. A minus number takes credits back.</p>
        <CreditsForm />
      </Card>

      <Card title="Settings">
        <SettingsForm key={JSON.stringify(overview.settings)} settings={overview.settings} onSaved={load} />
      </Card>

      <Card title="Recently checked">
        <ul className="divide-y divide-stone-100 text-sm">
          {overview.recent.map(recharge => (
            <li key={recharge.id} className="flex justify-between gap-2 py-2">
              <span className="min-w-0 truncate">{recharge.user_email} · {formatInr(recharge.amount_inr)} · UTR {recharge.utr}</span>
              <span className={`shrink-0 font-bold ${recharge.status === 'APPROVED' ? 'text-emerald-700' : 'text-red-700'}`}>
                {recharge.status === 'APPROVED' ? (recharge.auto_verified ? 'Auto' : 'Approved') : 'Rejected'}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Automatic verification">
        <p className="text-sm text-stone-600">
          Bank credit SMS forwarded to <code className="select-all break-all rounded bg-stone-100 px-1">{webhook}</code> with the header
          {' '}<code className="rounded bg-stone-100 px-1">Authorization: Bearer &lt;PAYMENT_WEBHOOK_SECRET&gt;</code> approve matching recharges at once.
          Steps are in docs/SETUP.md.
        </p>
      </Card>
    </div>
  )
}

export default function AdminPage() {
  return (
    <ToastProvider>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2"><LogoMark size={36} /><Wordmark /></Link>
          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">Admin</span>
        </div>
        <AdminConsole />
      </main>
    </ToastProvider>
  )
}
