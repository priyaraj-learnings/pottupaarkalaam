'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

import UpiQr from '@/components/UpiQr'
import { Button, Card, formatInr, formatWhen, Notice, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import type { Account, AppSettings, RechargeView } from '@/lib/client/types'
import { normalizeUtr, quoteRecharge, rechargeChoices, type Pricing } from '@/lib/rules'
import { COMPANY } from '@/lib/legal'
import { phoneKind, upiAppLinks, upiLink } from '@/lib/upi'

const STATUS = {
  APPROVED: { label: 'Added', className: 'bg-emerald-100 text-emerald-800' },
  PENDING: { label: 'Checking', className: 'bg-amber-100 text-amber-900' },
  REJECTED: { label: 'Not found', className: 'bg-red-100 text-red-800' },
} as const

// The bulk saving in words: "Half price" at ₹5 vs ₹10, "37% off" at ₹5 vs ₹8.
function bulkSaving(pricing: Pricing) {
  const off = Math.floor((1 - pricing.bulkRateInr / pricing.standardRateInr) * 100)
  return off === 50 ? 'Half price' : `${off}% off`
}

type Step = 'amount' | 'pay' | 'reference' | 'done'

const STEPS: Array<{ id: Exclude<Step, 'done'>; label: string }> = [
  { id: 'amount', label: 'Amount' },
  { id: 'pay', label: 'Pay' },
  { id: 'reference', label: 'Reference' },
]

// Where the customer is in the wizard, kept for this visit: phones sometimes
// reload the page while the customer is in their UPI app.
const WIZARD_KEY = 'pp-recharge-wizard'
type Saved = { step: Step; amount: number; custom: string }

function readSaved(): Saved | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(WIZARD_KEY) ?? 'null') as Saved | null
    return saved && ['amount', 'pay', 'reference'].includes(saved.step) ? saved : null
  } catch {
    return null
  }
}

function writeSaved(saved: Saved | null) {
  try {
    if (saved) sessionStorage.setItem(WIZARD_KEY, JSON.stringify(saved))
    else sessionStorage.removeItem(WIZARD_KEY)
  } catch {
    // Private mode: the wizard just starts again.
  }
}

function Progress({ step }: { step: Step }) {
  const index = step === 'done' ? STEPS.length : STEPS.findIndex(item => item.id === step)
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Recharge steps">
      {STEPS.map((item, position) => {
        const done = position < index
        const current = position === index
        return (
          <li key={item.id} aria-current={current ? 'step' : undefined} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${done ? 'bg-emerald-500' : current ? 'brand-gradient' : 'bg-stone-200'}`} />
            <span className={`mt-1 block truncate text-xs font-bold ${current ? 'text-brand-800' : done ? 'text-emerald-700' : 'text-stone-400'}`}>
              {done ? '✓ ' : `${position + 1}. `}{item.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// What to do on this step, and what comes after it.
function Guide({ now, next }: { now: ReactNode; next?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-brand-50 p-3 text-[15px] text-stone-800 ring-1 ring-brand-100">
      <p>{now}</p>
      {next && <p className="mt-1.5 text-sm text-stone-600"><b>Next:</b> {next}</p>}
    </div>
  )
}

export default function Recharge({ active, account, settings, userCode, onAccount, onTryOn }: {
  active: boolean
  account: Account
  settings: AppSettings
  userCode: string
  onAccount: (account: Account) => void
  onTryOn?: () => void
}) {
  const toast = useToast()
  const { pricing } = settings
  const choices = useMemo(() => rechargeChoices(pricing), [pricing])
  const [saved] = useState(readSaved)
  const [step, setStep] = useState<Step>(saved?.step ?? 'amount')
  const [amount, setAmount] = useState<number>(saved?.amount ?? choices[2] ?? choices[0] ?? pricing.minRechargeInr)
  const [custom, setCustom] = useState(saved?.custom ?? '')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [qrSaved, setQrSaved] = useState(false)
  const [result, setResult] = useState<RechargeView | null>(null)
  const [recharges, setRecharges] = useState<RechargeView[]>([])
  // The app only renders in the browser (after sign-in), so navigator is there.
  const [phone] = useState(() => (typeof navigator === 'undefined' ? 'other' : phoneKind(navigator.userAgent)))
  const onPhone = phone !== 'other'
  const canPaste = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText)
  const top = useRef<HTMLDivElement>(null)
  const wentToPay = useRef(false)

  const chosen = custom ? Number(custom) : amount
  const quote = quoteRecharge(chosen, pricing)
  const payee = settings.payeeName ?? 'inaivu IT'
  const link = settings.upiId && quote.ok
    ? upiLink({ upiId: settings.upiId, payeeName: settings.payeeName, amountInr: chosen, note: `PottuPaarkalaam ${userCode}`, qrText: settings.upiQrText })
    : null

  const go = useCallback((next: Step) => {
    setStep(next)
    setError('')
    writeSaved(next === 'done' ? null : { step: next, amount, custom })
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [amount, custom])

  // Back from the UPI app: on to "Enter the UPI reference".
  useEffect(() => {
    if (!active) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !wentToPay.current) return
      wentToPay.current = false
      if (step === 'pay') {
        go('reference')
        toast('Welcome back! Now enter the UPI reference of your payment.')
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [active, step, go, toast])

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(settings.upiId ?? '')
      wentToPay.current = true
      toast('UPI ID copied. Paste it in your UPI app.')
    } catch {
      toast('Could not copy. Press and hold the UPI ID to copy it.', 'error')
    }
  }

  async function pasteUtr() {
    try {
      const text = await navigator.clipboard.readText()
      const found = text.replace(/\s/g, '').match(/\d{12}/)?.[0]
      if (found) {
        setUtr(found)
        setError('')
      } else {
        setError('No 12-digit UPI reference was copied. Copy it from your payment app, then tap Paste.')
      }
    } catch {
      setError('Could not paste. Press and hold in the box, then choose Paste.')
    }
  }

  const load = useCallback(async () => {
    try {
      const list = (await api<{ recharges: RechargeView[] }>('/api/recharges')).recharges
      setRecharges(list)
      setResult(current => (current ? list.find(item => item.id === current.id) ?? current : current))
    } catch {
      // The list is a convenience; the wizard still works.
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
      const created = await api<{ recharge: RechargeView; account: Account }>('/api/recharges', {
        method: 'POST', json: { amountInr: chosen, utr: reference },
      })
      onAccount(created.account)
      setUtr('')
      setQrSaved(false)
      setResult(created.recharge)
      go('done')
      await load()
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  function startAgain() {
    setResult(null)
    go('amount')
  }

  const amountText = formatInr(chosen)

  return (
    <div className="space-y-4">
      <div ref={top} className="scroll-mt-24">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-2xl font-black">Recharge</h1>
          <p className="text-right text-sm text-stone-600">
            You have <b className="text-brand-700">{account.freeLeft + account.credits}</b> credits
            <span className="block text-xs text-stone-500">{account.freeLeft} free · {account.credits} paid</span>
          </p>
        </div>
      </div>

      {!settings.upiId ? (
        <Notice tone="warning">Recharge is opening soon. Please check again later.</Notice>
      ) : (
        <Card>
          <div className="space-y-4">
            <Progress step={step} />

            {step === 'amount' && (
              <>
                <Guide
                  now={<>Choose how much to add. Bigger recharges cost less per credit.</>}
                  next={<>you pay that amount with any UPI app (PhonePe, Paytm, Google Pay, BHIM).</>}
                />
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
                        {choice >= pricing.bulkMinRechargeInr && pricing.bulkRateInr < pricing.standardRateInr && (
                          <span className="block text-[11px] font-bold text-emerald-700">{bulkSaving(pricing)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700" htmlFor="custom-amount">Or type another amount (₹)</label>
                  <input id="custom-amount" inputMode="numeric" value={custom} placeholder={`Minimum ${formatInr(pricing.minRechargeInr)}`}
                    onChange={event => setCustom(event.target.value.replace(/\D/g, '').slice(0, 7))}
                    className="mt-1 min-h-12 w-full rounded-2xl border border-stone-300 px-4 text-base outline-none focus:border-brand-500" />
                  <p className={`mt-2 text-sm font-semibold ${quote.ok ? 'text-brand-800' : 'text-red-700'}`}>
                    {quote.ok ? `${amountText} → ${quote.credits} credits (${formatInr(quote.rateInr)} each)` : quote.message}
                  </p>
                </div>
                <details className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-600">
                  <summary className="cursor-pointer font-semibold text-brand-700">See prices</summary>
                  <ul className="mt-2 space-y-1">
                    <li className="flex justify-between gap-2"><span>Recharge below {formatInr(pricing.bulkMinRechargeInr)}</span><b>{formatInr(pricing.standardRateInr)} a credit</b></li>
                    <li className="flex justify-between gap-2"><span>Recharge {formatInr(pricing.bulkMinRechargeInr)} or more</span><b className="text-emerald-700">{formatInr(pricing.bulkRateInr)} a credit</b></li>
                  </ul>
                  <p className="mt-2">
                    One garment = 1 credit. A pair (worn together) = 2 credits.
                    {settings.couple.enabled && <> A couple picture = {settings.couple.credits} paid credits.</>}
                    {' '}{pricing.freeCreditsPerMonth} free credits every month. Paid credits don&rsquo;t expire while the service runs.
                  </p>
                  <p className="mt-1">These are the full prices: nothing is added when you pay.</p>
                </details>
                <Button disabled={!quote.ok} onClick={() => go('pay')} className="w-full text-base">Next: pay {amountText} →</Button>
              </>
            )}

            {step === 'pay' && link && (
              <>
                <Guide
                  now={<>Pay exactly <b>{amountText}</b> to <b>{payee}</b> with any UPI app. A different amount cannot be matched to your recharge.</>}
                  next={<>come back here and enter the 12-digit UPI reference of the payment.</>}
                />
                {onPhone && settings.upiAppButtons ? (
                  <>
                    <p className="text-sm font-semibold text-stone-700">Tap your UPI app:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {upiAppLinks(link, phone).map((option, index) => (
                        <a key={option.app} href={option.href} onClick={() => { wentToPay.current = true }}
                          className={`flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-1.5 text-center text-[13px] font-bold whitespace-nowrap text-brand-700 sm:text-sm active:bg-brand-50 ${index < 3 ? '' : 'col-span-3'}`}>
                          {option.app}
                        </a>
                      ))}
                    </div>
                    <p className="text-xs text-stone-500">If nothing opens, that app is not on this phone: try another, or copy the UPI ID below.</p>
                  </>
                ) : onPhone ? (
                  // UPI accepts a scan of the business QR, also from a photo, where it declines link payments.
                  <ol className="space-y-3">
                    <li className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-sm font-bold text-stone-800">{qrSaved ? '✓' : 'a.'} Save the QR to your phone</p>
                      <p className="mb-2 text-xs text-stone-500">It is saved as a picture named &ldquo;Pay {amountText}&rdquo;.</p>
                      <UpiQr link={link} amountInr={chosen} payee={payee} primary onSaved={() => { setQrSaved(true); wentToPay.current = true }} />
                    </li>
                    <li className={`rounded-2xl p-3 ${qrSaved ? 'bg-brand-50 ring-1 ring-brand-100' : 'bg-stone-50'}`}>
                      <p className="text-sm font-bold text-stone-800">b. Scan it from your UPI app</p>
                      <p className="text-sm text-stone-700">
                        Open <b>PhonePe, Paytm, Google Pay or BHIM</b> → tap <b>Scan</b> → tap the <b>gallery / photo</b> icon on the
                        scan screen → choose the saved QR.
                      </p>
                    </li>
                    <li className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-sm font-bold text-stone-800">c. Pay {amountText}</p>
                      <p className="text-sm text-stone-700">Check the name says <b>{payee}</b> and the amount is <b>{amountText}</b>, then pay. Come back to this app afterwards.</p>
                    </li>
                  </ol>
                ) : (
                  <div className="rounded-2xl bg-stone-50 p-3 text-center text-sm">
                    <p className="mb-2 font-bold">Scan this QR with any UPI app on your phone</p>
                    <UpiQr link={link} amountInr={chosen} payee={payee} />
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 text-sm text-stone-600">
                  <span className="min-w-0 truncate">Or pay to UPI ID <span className="select-all font-mono">{settings.upiId}</span></span>
                  <button type="button" onClick={copyUpiId} className="shrink-0 rounded-full border border-brand-200 px-3 py-1 text-xs font-bold text-brand-700">Copy</button>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <Button variant="ghost" onClick={() => go('amount')}>← Back</Button>
                  <Button onClick={() => go('reference')}>I have paid → Next</Button>
                </div>
              </>
            )}

            {step === 'reference' && (
              <form onSubmit={submit} className="space-y-4">
                <Guide
                  now={<>In your UPI app, open the payment of <b>{amountText}</b> you just made and copy its <b>12-digit UPI reference</b>. Then tap <b>Paste</b>.</>}
                  next={<>we match it with the bank and add your {quote.ok ? quote.credits : ''} credits, usually within minutes.</>}
                />
                <div className="flex gap-2">
                  <input inputMode="numeric" autoComplete="off" value={utr} placeholder="e.g. 629912345678" aria-label="UPI reference (UTR)"
                    onChange={event => setUtr(event.target.value.replace(/[^\d ]/g, '').slice(0, 15))}
                    className="min-h-12 min-w-0 flex-1 rounded-2xl border border-stone-300 px-3 text-center text-base font-bold tracking-wider outline-none focus:border-brand-500 sm:text-lg sm:tracking-widest" />
                  {canPaste && <Button variant="secondary" onClick={pasteUtr} className="shrink-0 px-4">Paste</Button>}
                </div>
                <details className="text-sm text-stone-600" open={!utr}>
                  <summary className="cursor-pointer font-semibold text-brand-700">Where do I find it?</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>PhonePe: open the payment → <b>UTR</b></li>
                    <li>Paytm: open the payment → <b>UPI Ref No.</b></li>
                    <li>Google Pay: open the payment → <b>UPI transaction ID</b></li>
                    <li>BHIM or bank app: the <b>UPI reference</b> or <b>RRN</b> (12 digits)</li>
                  </ul>
                </details>
                {error && <Notice tone="error">{error}</Notice>}
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <Button variant="ghost" onClick={() => go('pay')}>← Back</Button>
                  <Button type="submit" busy={busy} disabled={!quote.ok}>Add my credits</Button>
                </div>
              </form>
            )}

            {step === 'done' && result && (
              <div className="space-y-4 text-center">
                {result.status === 'APPROVED' ? (
                  <>
                    <p className="text-5xl" aria-hidden="true">🎉</p>
                    <p className="text-xl font-black text-emerald-700">{result.credits} credits added</p>
                    <p className="text-sm text-stone-600">Thank you! Your payment of {formatInr(result.amountInr)} is confirmed.</p>
                  </>
                ) : result.status === 'PENDING' ? (
                  <>
                    <p className="text-5xl" aria-hidden="true">⏳</p>
                    <p className="text-xl font-black">Checking your payment</p>
                    <p className="text-sm text-stone-600">
                      We are matching UPI reference <b>{result.utr}</b> with the bank. This usually takes a few minutes, at most a few
                      hours. You can keep using the app: your {result.credits} credits appear here by themselves.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-5xl" aria-hidden="true">😕</p>
                    <p className="text-xl font-black text-red-700">Payment not found</p>
                    <p className="text-sm text-stone-600">
                      {result.rejectionReason ?? 'We could not find this payment.'} If money left your account, contact us with the UPI
                      reference: {COMPANY.supportPhone}.
                    </p>
                  </>
                )}
                <div className="grid grid-cols-1 gap-2">
                  {onTryOn && <Button onClick={onTryOn} className="w-full">Start trying on</Button>}
                  <Button variant="secondary" onClick={startAgain} className="w-full">Make another recharge</Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

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
          <p className="mt-2 text-xs text-stone-500">Paid but not added after a day? Contact us: {settings.supportContact ?? COMPANY.supportPhone}</p>
        </Card>
      )}
    </div>
  )
}
