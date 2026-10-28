'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import UpiQr from '@/components/UpiQr'
import { Button, Card, formatInr, formatWhen, Notice, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import type { Account, AppSettings, RechargeView } from '@/lib/client/types'
import { normalizeUtr, quoteRecharge, rechargeChoices } from '@/lib/rules'
import { upiLink } from '@/lib/upi'

const STATUS = {
  APPROVED: { label: 'Added', className: 'bg-emerald-100 text-emerald-800' },
  PENDING: { label: 'Checking', className: 'bg-amber-100 text-amber-900' },
  REJECTED: { label: 'Not found', className: 'bg-red-100 text-red-800' },
} as const

export default function Recharge({ active, account, settings, userCode, onAccount }: {
  active: boolean
  account: Account
  settings: AppSettings
  userCode: string
  onAccount: (account: Account) => void
}) {
  const toast = useToast()
  const { pricing } = settings
  const choices = useMemo(() => rechargeChoices(pricing), [pricing])
  const [amount, setAmount] = useState<number>(choices[2] ?? choices[0] ?? pricing.minRechargeInr)
  const [custom, setCustom] = useState('')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recharges, setRecharges] = useState<RechargeView[]>([])

  const load = useCallback(async () => {
    try {
      setRecharges((await api<{ recharges: RechargeView[] }>('/api/recharges')).recharges)
    } catch {
      // The list is a convenience; the form still works.
    }
  }, [])
  const waiting = recharges.some(recharge => recharge.status === 'PENDING')
  useEffect(() => {
    if (!active) return
    const first = setTimeout(load, 0)
    // While a recharge is being checked, look again now and then.
    const timer = waiting ? setInterval(load, 20_000) : undefined
    return () => {
      clearTimeout(first)
      if (timer) clearInterval(timer)
    }
  }, [active, waiting, load])

  const chosen = custom ? Number(custom) : amount
  const quote = quoteRecharge(chosen, pricing)
  const link = settings.upiId && quote.ok
    ? upiLink({ upiId: settings.upiId, payeeName: settings.payeeName, amountInr: chosen, note: `PottuPaarkalaam ${userCode}` })
    : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const reference = normalizeUtr(utr)
    if (!reference) {
      setError('Enter the 12-digit UPI reference number from your payment app.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<{ recharge: RechargeView; account: Account }>('/api/recharges', {
        method: 'POST', json: { amountInr: chosen, utr: reference },
      })
      onAccount(result.account)
      setUtr('')
      toast(result.recharge.status === 'APPROVED'
        ? `${result.recharge.credits} credits added. Happy trying!`
        : 'Thank you! We will add your credits after checking the payment, usually within a few hours.')
      await load()
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Recharge</h1>

      <Card>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-stone-500">Credits you have</p>
            <p className="text-4xl font-black text-brand-700">{account.freeLeft + account.credits}</p>
          </div>
          <div className="text-right text-sm text-stone-600">
            <p>Free this month: <b>{account.freeLeft}</b> of {account.freeCreditsPerMonth}</p>
            <p>Paid: <b>{account.credits}</b></p>
          </div>
        </div>
      </Card>

      <Card title="Prices">
        <ul className="space-y-2 text-[15px]">
          <li className="flex justify-between gap-2"><span>Recharge below {formatInr(pricing.bulkMinRechargeInr)}</span><b>{formatInr(pricing.standardRateInr)} a credit</b></li>
          <li className="flex justify-between gap-2"><span>Recharge {formatInr(pricing.bulkMinRechargeInr)} or more</span><b className="text-emerald-700">{formatInr(pricing.bulkRateInr)} a credit</b></li>
        </ul>
        <p className="mt-3 text-sm text-stone-500">One garment = 1 credit. A pair (worn together) = 2 credits. {pricing.freeCreditsPerMonth} free credits every month. Paid credits never expire.</p>
      </Card>

      <Card title="1. Choose an amount">
        <div className="grid grid-cols-3 gap-2">
          {choices.map(choice => {
            const credits = quoteRecharge(choice, pricing)
            const selected = !custom && choice === amount
            return (
              <button key={choice} type="button" aria-pressed={selected}
                onClick={() => { setAmount(choice); setCustom('') }}
                className={`rounded-2xl border-2 p-2 text-center ${selected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'}`}>
                <span className="block text-lg font-black">{formatInr(choice)}</span>
                <span className="block text-xs text-stone-500">{credits.ok ? `${credits.credits} credits` : ''}</span>
                {choice >= pricing.bulkMinRechargeInr && <span className="block text-[11px] font-bold text-emerald-700">Half price</span>}
              </button>
            )
          })}
        </div>
        <label className="mt-3 block text-sm font-bold text-stone-700" htmlFor="custom-amount">Or another amount (₹)</label>
        <input id="custom-amount" inputMode="numeric" value={custom} placeholder={`Minimum ${formatInr(pricing.minRechargeInr)}`}
          onChange={event => setCustom(event.target.value.replace(/\D/g, '').slice(0, 7))}
          className="mt-1 min-h-12 w-full rounded-2xl border border-stone-300 px-4 text-base outline-none focus:border-brand-500" />
        <p className={`mt-2 text-sm font-semibold ${quote.ok ? 'text-brand-800' : 'text-red-700'}`}>
          {quote.ok ? `${formatInr(chosen)} → ${quote.credits} credits (${formatInr(quote.rateInr)} each)` : quote.message}
        </p>
      </Card>

      <Card title="2. Pay by UPI">
        {!settings.upiId ? (
          <Notice tone="warning">Recharge is opening soon. Please check again later.</Notice>
        ) : !link ? (
          <p className="text-sm text-stone-500">Choose an amount first.</p>
        ) : (
          <div className="space-y-3">
            <a href={link} className="brand-gradient flex min-h-12 items-center justify-center rounded-2xl px-4 text-base font-bold text-white shadow-md">
              Pay {formatInr(chosen)} with a UPI app
            </a>
            <p className="text-center text-sm text-stone-600">
              To <b>{settings.payeeName ?? 'inaivu IT'}</b> · <span className="select-all font-mono">{settings.upiId}</span>
            </p>
            <div className="rounded-2xl bg-stone-50 p-3 text-center text-sm">
              <p className="mb-2 font-bold">Or scan this QR with any UPI app</p>
              <UpiQr link={link} amountInr={chosen} />
            </div>
            <p className="text-xs text-stone-500">Pay exactly {formatInr(chosen)}, then come back here for step 3.</p>
          </div>
        )}
      </Card>

      <Card title="3. Enter the UPI reference">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-stone-600">After paying {formatInr(chosen)}, copy the <b>12-digit UPI reference (UTR)</b> from your payment app.</p>
          <input inputMode="numeric" autoComplete="off" value={utr} placeholder="e.g. 629912345678" aria-label="UPI reference (UTR)"
            onChange={event => setUtr(event.target.value.replace(/[^\d ]/g, '').slice(0, 15))}
            className="min-h-12 w-full rounded-2xl border border-stone-300 px-4 text-center text-lg font-bold tracking-widest outline-none focus:border-brand-500" />
          <details className="text-sm text-stone-600">
            <summary className="cursor-pointer font-semibold text-brand-700">Where do I find it?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Google Pay: open the payment → <b>UPI transaction ID</b></li>
              <li>PhonePe: open the payment → <b>UTR</b></li>
              <li>Paytm: open the payment → <b>UPI Ref No.</b></li>
              <li>Bank app: the <b>UPI reference</b> or <b>RRN</b> (12 digits)</li>
            </ul>
          </details>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" busy={busy} disabled={!quote.ok || !settings.upiId} className="w-full">I have paid {formatInr(chosen)}</Button>
        </form>
      </Card>

      {recharges.length > 0 && (
        <Card title="Your recharges">
          <ul className="divide-y divide-stone-100">
            {recharges.map(recharge => (
              <li key={recharge.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0">
                  <b>{formatInr(recharge.amountInr)}</b> · {recharge.credits} credits
                  <span className="block truncate text-xs text-stone-500">
                    {formatWhen(recharge.createdAt)} · UTR {recharge.utr}{recharge.rejectionReason ? ` · ${recharge.rejectionReason}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[recharge.status].className}`}>{STATUS[recharge.status].label}</span>
              </li>
            ))}
          </ul>
          {settings.supportContact && <p className="mt-2 text-xs text-stone-500">Paid but not added after a day? Contact us: {settings.supportContact}</p>}
        </Card>
      )}
    </div>
  )
}
