'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { PeriodPicker } from '@/components/admin/Overview'
import { downloadCsv, money, type Overview, type Period, type Recharge } from '@/components/admin/types'
import { Button, Card, formatWhen, Notice, Spinner, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { customerCode } from '@/lib/upi'
import { SubTabs, useSubTab, type SubTab } from '@/components/admin/SubTabs'
import { inView, PAYMENT_VIEWS, viewTotals, type PaymentView } from '@/components/admin/paymentViews'

const STATUS = {
  APPROVED: { label: 'Added', className: 'bg-emerald-100 text-emerald-800' },
  PENDING: { label: 'Checking', className: 'bg-amber-100 text-amber-900' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
} as const

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
          <p className="text-xs text-stone-500">Code {recharge.user_id ? customerCode(recharge.user_id) : '—'} · {formatWhen(recharge.created_at)}</p>
        </div>
        <p className="text-xl font-black">{money(recharge.amount_inr)} <span className="text-sm font-semibold text-stone-500">→ {recharge.credits} credits</span></p>
      </div>
      <p className="text-sm">UTR <code className="select-all rounded bg-stone-100 px-1.5 py-0.5 font-mono">{recharge.utr}</code></p>
      <p className={`text-sm font-semibold ${bank == null ? 'text-stone-500' : matches ? 'text-emerald-700' : 'text-red-700'}`}>
        {bank == null ? 'No bank alert for this UTR yet: check your bank app.' : matches ? 'Bank alert matches.' : `Bank alert says ${money(Number(bank))}.`}
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

function exportPayments(rows: Recharge[], period: Period) {
  downloadCsv(`pottupaarkalaam-payments-${period}.csv`,
    ['Submitted', 'Email', 'Customer code', 'Amount (Rs)', 'Credits', 'Rs per credit', 'UTR', 'Status', 'Verified', 'Checked at', 'Reason'],
    rows.map(row => [
      row.created_at, row.user_email, row.user_id ? customerCode(row.user_id) : '', row.amount_inr, row.credits, row.rate_inr ?? '',
      row.utr, STATUS[row.status].label, row.status === 'APPROVED' ? (row.auto_verified ? 'automatic' : 'by admin') : '',
      row.reviewed_at ?? '', row.rejection_reason ?? '',
    ]))
}

type PaymentsSection = 'check' | 'all' | 'bank'
const PAYMENTS_TABS: ReadonlyArray<SubTab<PaymentsSection>> = [{ id: 'check', label: 'To check' }, { id: 'all', label: 'All payments' }, { id: 'bank', label: 'Bank credits' }]

export default function Payments({ active, overview, onChanged }: { active: boolean; overview: Overview | null; onChanged: () => void }) {
  const [period, setPeriod] = useState<Period>('this-month')
  const [section, setSection] = useSubTab('pp-admin-payments-tab', PAYMENTS_TABS)
  // A tile over the table: which payments to list.
  const [view, setView] = useState<PaymentView>('ALL')
  const [filter, setFilter] = useState('')
  const [rows, setRows] = useState<Recharge[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      // Every status: the tiles count them all and filter on this device.
      const params = new URLSearchParams({ period })
      setRows((await api<{ payments: Recharge[] }>(`/api/admin/payments?${params}`)).payments)
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [period])

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [active, load])

  const totals = useMemo(() => viewTotals(rows ?? []), [rows])
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return (rows ?? []).filter(row => inView(row, view) && (!needle || (row.user_email ?? '').toLowerCase().includes(needle) || row.utr.includes(needle)))
  }, [rows, filter, view])
  const received = shown.filter(row => row.status === 'APPROVED').reduce((sum, row) => sum + row.amount_inr, 0)

  const paymentTabs: ReadonlyArray<SubTab<PaymentsSection>> = [
    { id: 'check', label: 'To check', badge: overview?.pending.length ?? 0 },
    { id: 'all', label: 'All payments' },
    { id: 'bank', label: 'Bank credits', badge: overview?.unmatchedAlerts.length ?? 0 },
  ]

  return (
    <div className="space-y-4">
      <SubTabs tabs={paymentTabs} active={section} onChange={setSection} label="Payments sections" />

      <Card title={`Recharges to check (${overview?.pending.length ?? 0})`} className={section === 'check' ? '' : 'hidden'}>
        {!overview ? <Spinner className="h-5 w-5 text-brand-600" /> : overview.pending.length === 0
          ? <p className="text-sm text-stone-500">Nothing waiting.</p>
          : <ul className="divide-y divide-stone-100">{overview.pending.map(recharge => <PendingRow key={recharge.id} recharge={recharge} onDone={() => { onChanged(); void load() }} />)}</ul>}
      </Card>

      <Card title="Bank credits nobody has claimed" className={section === 'bank' ? '' : 'hidden'}>
        <p className="mb-2 text-sm text-stone-500">Payments your bank reported that no customer has entered yet. They are matched automatically when the customer enters the UTR.</p>
        {!overview || overview.unmatchedAlerts.length === 0 ? <p className="text-sm text-stone-500">None.</p> : (
          <ul className="divide-y divide-stone-100 text-sm">
            {overview.unmatchedAlerts.map(alert => (
              <li key={alert.id} className="py-2">
                <b>{money(Number(alert.amount_inr))}</b> · UTR <code className="font-mono">{alert.utr}</code> · {formatWhen(alert.received_at)}
                <span className="block truncate text-xs text-stone-500">{alert.sender} · {alert.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="All payments" className={section === 'all' ? '' : 'hidden'}>
        <div className="space-y-3">
          <PeriodPicker value={period} onChange={setPeriod} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Show payments">
            {PAYMENT_VIEWS.map(option => {
              const selected = view === option.id
              const total = totals[option.id]
              return (
                <button key={option.id} type="button" aria-pressed={selected} onClick={() => setView(current => (current === option.id && option.id !== 'ALL' ? 'ALL' : option.id))}
                  className={`rounded-2xl p-3 text-left ring-1 ${selected ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white ring-stone-200'}`}>
                  <span className={`block text-xs font-bold ${selected ? 'text-stone-300' : 'text-stone-500'}`}>{option.label}</span>
                  <span className="block text-2xl font-black tabular-nums">{rows ? total.count : '—'}</span>
                  <span className={`block text-xs ${selected ? 'text-stone-300' : 'text-stone-500'}`}>{rows ? money(total.amountInr) : option.hint}</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Email or UTR" aria-label="Filter by email or UTR"
              className="min-h-10 min-w-0 flex-1 rounded-xl border border-stone-300 px-3" />
            <Button variant="secondary" disabled={!shown.length} onClick={() => exportPayments(shown, period)} className="min-h-10 text-sm">Export CSV</Button>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {rows === null ? <div className="flex justify-center py-6 text-brand-600"><Spinner className="h-6 w-6" /></div> : (
            <>
              <p className="text-sm text-stone-600">
                <b>{PAYMENT_VIEWS.find(option => option.id === view)?.label}</b>: {shown.length} payment{shown.length === 1 ? '' : 's'}
                {view !== 'PENDING' && view !== 'REJECTED' && <> · <b>{money(received)}</b> added</>}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr><th className="py-2 pr-2">When</th><th className="py-2 pr-2">Customer</th><th className="py-2 pr-2 text-right">Amount</th><th className="py-2 pr-2 text-right">Credits</th><th className="py-2 pr-2">UTR</th><th className="py-2 pr-2">Status</th><th className="py-2">Checked</th></tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {shown.map(row => (
                      <tr key={row.id} className="border-t border-stone-100 align-top">
                        <td className="py-2 pr-2 whitespace-nowrap">{formatWhen(row.created_at)}</td>
                        <td className="max-w-[12rem] truncate py-2 pr-2">{row.user_email}</td>
                        <td className="py-2 pr-2 text-right font-bold">{money(row.amount_inr)}</td>
                        <td className="py-2 pr-2 text-right">{row.credits}</td>
                        <td className="py-2 pr-2 font-mono text-xs">{row.utr}</td>
                        <td className="py-2 pr-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[row.status].className}`}>{STATUS[row.status].label}</span>
                          {row.status === 'APPROVED' && <span className="ml-1 text-xs text-stone-500">{row.auto_verified ? 'auto' : 'by you'}</span>}
                          {row.rejection_reason && <span className="block text-xs text-stone-500">{row.rejection_reason}</span>}
                        </td>
                        <td className="py-2 whitespace-nowrap text-xs text-stone-500">{row.reviewed_at ? formatWhen(row.reviewed_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
