'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

import UpiQr from '@/components/UpiQr'
import { Button, Card, formatInr, formatWhen, Notice, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import type { Account, AppSettings, RechargeView } from '@/lib/client/types'
import { normalizeUtr, quoteRecharge, rechargeChoices, type Pricing } from '@/lib/rules'
import { COMPANY } from '@/lib/legal'
import { useLanguage, useT, type Translate } from '@/lib/client/language'
import { phoneKind, upiAppLinks, upiLink } from '@/lib/upi'

const STATUS = {
  APPROVED: { label: 'Added', labelTa: 'சேர்க்கப்பட்டது', className: 'bg-emerald-100 text-emerald-800' },
  PENDING: { label: 'Checking', labelTa: 'சரிபார்க்கிறோம்', className: 'bg-amber-100 text-amber-900' },
  REJECTED: { label: 'Not found', labelTa: 'கிடைக்கவில்லை', className: 'bg-red-100 text-red-800' },
} as const

// The bulk saving in words: "Half price" at ₹5 vs ₹10, "37% off" at ₹5 vs ₹8.
function bulkSaving(pricing: Pricing, t: Translate) {
  const off = Math.floor((1 - pricing.bulkRateInr / pricing.standardRateInr) * 100)
  return off === 50 ? t('Half price', 'பாதி விலை') : t(`${off}% off`, `${off}% குறைவு`)
}

type Step = 'amount' | 'pay' | 'reference' | 'done'

const STEPS: Array<{ id: Exclude<Step, 'done'>; label: string; labelTa: string }> = [
  { id: 'amount', label: 'Amount', labelTa: 'தொகை' },
  { id: 'pay', label: 'Pay', labelTa: 'பணம் செலுத்து' },
  { id: 'reference', label: 'Reference', labelTa: 'குறிப்பு எண்' },
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
  const t = useT()
  const index = step === 'done' ? STEPS.length : STEPS.findIndex(item => item.id === step)
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label={t('Recharge steps', 'ரீசார்ஜ் படிகள்')}>
      {STEPS.map((item, position) => {
        const done = position < index
        const current = position === index
        return (
          <li key={item.id} aria-current={current ? 'step' : undefined} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${done ? 'bg-emerald-500' : current ? 'brand-gradient' : 'bg-stone-200'}`} />
            <span className={`mt-1 block truncate text-xs font-bold ${current ? 'text-brand-800' : done ? 'text-emerald-700' : 'text-stone-400'}`}>
              {done ? '✓ ' : `${position + 1}. `}{t(item.label, item.labelTa)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// What to do on this step, and what comes after it.
function Guide({ now, next }: { now: ReactNode; next?: ReactNode }) {
  const t = useT()
  return (
    <div className="rounded-2xl bg-brand-50 p-3 text-[15px] text-stone-800 ring-1 ring-brand-100">
      <p>{now}</p>
      {next && <p className="mt-1.5 text-sm text-stone-600"><b>{t('Next:', 'அடுத்து:')}</b> {next}</p>}
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
  const t = useT()
  const ta = useLanguage() === 'ta'
  const { pricing } = settings
  const choices = useMemo(() => rechargeChoices(pricing), [pricing])
  // The starter pack, while this account has not recharged yet.
  const starter = account.starterAvailable ? settings.starterPack : null
  const [saved] = useState(readSaved)
  const [step, setStep] = useState<Step>(saved?.step ?? 'amount')
  const [amount, setAmount] = useState<number>(saved?.amount ?? (account.starterAvailable && settings.starterPack ? settings.starterPack.amountInr : choices[2] ?? choices[0] ?? pricing.minRechargeInr))
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
  const quote = quoteRecharge(chosen, pricing, starter)
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
        toast(t('Welcome back! Now enter the UPI reference of your payment.', 'மீண்டும் வருக! இப்போது உங்கள் பணம் செலுத்தியதன் UPI குறிப்பு எண்ணை உள்ளிடுங்கள்.'))
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [active, step, go, toast, t])

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(settings.upiId ?? '')
      wentToPay.current = true
      toast(t('UPI ID copied. Paste it in your UPI app.', 'UPI ID நகலெடுக்கப்பட்டது. உங்கள் UPI செயலியில் ஒட்டுங்கள்.'))
    } catch {
      toast(t('Could not copy. Press and hold the UPI ID to copy it.', 'நகலெடுக்க முடியவில்லை. UPI ID-ஐ அழுத்திப் பிடித்து நகலெடுங்கள்.'), 'error')
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
        setError(t('No 12-digit UPI reference was copied. Copy it from your payment app, then tap Paste.', '12 இலக்க UPI குறிப்பு எண் நகலெடுக்கப்படவில்லை. உங்கள் பணம் செலுத்திய செயலியில் இருந்து நகலெடுத்து, பிறகு ஒட்டு என்பதைத் தட்டுங்கள்.'))
      }
    } catch {
      setError(t('Could not paste. Press and hold in the box, then choose Paste.', 'ஒட்ட முடியவில்லை. பெட்டியில் அழுத்திப் பிடித்து, பிறகு Paste / ஒட்டு என்பதைத் தேர்ந்தெடுங்கள்.'))
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
      setError(t('Enter the 12-digit UPI reference number from your payment app.', 'உங்கள் பணம் செலுத்திய செயலியில் உள்ள 12 இலக்க UPI குறிப்பு எண்ணை உள்ளிடுங்கள்.'))
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
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <h1 className="text-2xl font-black">{t('Recharge', 'ரீசார்ஜ்')}</h1>
          <p className="min-w-0 text-right text-sm text-stone-600">
            {t('You have', 'உங்களிடம்')} <b className="text-brand-700">{account.freeLeft + account.credits}</b>{' '}
            {account.freeLeft + account.credits === 1 ? t('credit', 'கிரெடிட் உள்ளது') : t('credits', 'கிரெடிட்கள் உள்ளன')}
            <span className="block text-xs text-stone-500">{t(`${account.freeLeft} free · ${account.credits} paid`, `${account.freeLeft} இலவசம் · ${account.credits} பணம் செலுத்தியவை`)}</span>
          </p>
        </div>
      </div>

      {!settings.upiId ? (
        <Notice tone="warning">{t('Recharge is opening soon. Please check again later.', 'ரீசார்ஜ் விரைவில் தொடங்கும். பிறகு மீண்டும் பாருங்கள்.')}</Notice>
      ) : (
        <Card>
          <div className="space-y-4">
            <Progress step={step} />

            {step === 'amount' && (
              <>
                <Guide
                  now={<>{t('Choose how much to add. Bigger recharges cost less per credit.', 'எவ்வளவு சேர்க்க வேண்டும் என்று தேர்ந்தெடுங்கள். பெரிய ரீசார்ஜில் ஒரு கிரெடிட்டின் விலை குறைவு.')}</>}
                  next={<>{t('you pay that amount with any UPI app (PhonePe, Paytm, Google Pay, BHIM).', 'அந்தத் தொகையை ஏதேனும் ஒரு UPI செயலியில் (PhonePe, Paytm, Google Pay, BHIM) செலுத்துங்கள்.')}</>}
                />
                {starter && (
                  <button type="button" aria-pressed={!custom && amount === starter.amountInr}
                    onClick={() => { setAmount(starter.amountInr); setCustom('') }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 p-3 text-left ${!custom && amount === starter.amountInr ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-200 bg-white'}`}>
                    <span>
                      <span className="block text-xs font-extrabold uppercase tracking-wide text-emerald-700">{t('🎉 Starter pack · first recharge only', '🎉 தொடக்கத் தொகுப்பு · முதல் ரீசார்ஜுக்கு மட்டும்')}</span>
                      <span className="block text-sm text-stone-600">{t(`${starter.credits} credits to try more clothes`, `மேலும் உடைகளை அணிந்து பார்க்க ${starter.credits} கிரெடிட்கள்`)}</span>
                    </span>
                    <span className="text-xl font-black">{formatInr(starter.amountInr)}</span>
                  </button>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {choices.map(choice => {
                    const credits = quoteRecharge(choice, pricing)
                    const selected = !custom && choice === amount
                    return (
                      <button key={choice} type="button" aria-pressed={selected}
                        onClick={() => { setAmount(choice); setCustom('') }}
                        className={`rounded-2xl border-2 p-2 text-center ${selected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'}`}>
                        <span className="block text-lg font-black">{formatInr(choice)}</span>
                        <span className="block whitespace-nowrap text-xs text-stone-500">{credits.ok ? t(`${credits.credits} credits`, `${credits.credits} கிரெடிட்`) : ''}</span>
                        {choice >= pricing.bulkMinRechargeInr && pricing.bulkRateInr < pricing.standardRateInr && (
                          <span className="block whitespace-nowrap text-[11px] font-bold text-emerald-700">{bulkSaving(pricing, t)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700" htmlFor="custom-amount">{t('Or type another amount (₹)', 'அல்லது வேறு தொகையை உள்ளிடுங்கள் (₹)')}</label>
                  <input id="custom-amount" inputMode="numeric" value={custom} placeholder={t(`Minimum ${formatInr(pricing.minRechargeInr)}`, `குறைந்தது ${formatInr(pricing.minRechargeInr)}`)}
                    onChange={event => setCustom(event.target.value.replace(/\D/g, '').slice(0, 7))}
                    className="mt-1 min-h-12 w-full rounded-2xl border border-stone-300 px-4 text-base outline-none focus:border-brand-500" />
                  <p className={`mt-2 text-sm font-semibold ${quote.ok ? 'text-brand-800' : 'text-red-700'}`}>
                    {quote.ok ? t(`${amountText} → ${quote.credits} credits (${formatInr(quote.rateInr)} each)`, `${amountText} → ${quote.credits} கிரெடிட்கள் (ஒன்றுக்கு ${formatInr(quote.rateInr)})`) : quote.message}
                  </p>
                </div>
                <details className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-600">
                  <summary className="cursor-pointer font-semibold text-brand-700">{t('See prices', 'விலைகளைப் பார்')}</summary>
                  <ul className="mt-2 space-y-1">
                    <li className="flex justify-between gap-2"><span>{t(`Recharge below ${formatInr(pricing.bulkMinRechargeInr)}`, `${formatInr(pricing.bulkMinRechargeInr)}-க்குக் குறைவான ரீசார்ஜ்`)}</span><b>{t(`${formatInr(pricing.standardRateInr)} a credit`, `ஒரு கிரெடிட் ${formatInr(pricing.standardRateInr)}`)}</b></li>
                    <li className="flex justify-between gap-2"><span>{t(`Recharge ${formatInr(pricing.bulkMinRechargeInr)} or more`, `${formatInr(pricing.bulkMinRechargeInr)} அல்லது அதற்கு மேல் ரீசார்ஜ்`)}</span><b className="text-emerald-700">{t(`${formatInr(pricing.bulkRateInr)} a credit`, `ஒரு கிரெடிட் ${formatInr(pricing.bulkRateInr)}`)}</b></li>
                  </ul>
                  <p className="mt-2">
                    {t('One garment = 1 credit. A pair (worn together) = 2 credits.', 'ஒரு உடை = 1 கிரெடிட். ஜோடியாக அணிதல் (இரண்டு உடைகள் சேர்த்து) = 2 கிரெடிட்கள்.')}
                    {settings.couple.enabled && <> {t(`A couple picture = ${settings.couple.credits} paid credits.`, `ஒரு ஜோடி படம் = ${settings.couple.credits} பணம் செலுத்திய கிரெடிட்கள்.`)}</>}
                    {' '}{t(`${pricing.freeCreditsPerMonth} free credits every month. Paid credits don’t expire while the service runs.`, `ஒவ்வொரு மாதமும் ${pricing.freeCreditsPerMonth} இலவச கிரெடிட்கள். சேவை நடக்கும் வரை பணம் செலுத்திய கிரெடிட்கள் காலாவதியாகாது.`)}
                  </p>
                  <p className="mt-1">{t('These are the full prices: nothing is added when you pay.', 'இவையே முழு விலைகள்: பணம் செலுத்தும்போது எதுவும் கூடுதலாகச் சேர்க்கப்படாது.')}</p>
                </details>
                <Button disabled={!quote.ok} onClick={() => go('pay')} className="w-full text-base">{t(`Next: pay ${amountText} →`, `அடுத்து: ${amountText} செலுத்துங்கள் →`)}</Button>
              </>
            )}

            {step === 'pay' && link && (
              <>
                <Guide
                  now={ta
                    ? <>எந்த UPI செயலியிலும் <b>{payee}</b>-க்குச் சரியாக <b>{amountText}</b> செலுத்துங்கள். வேறு தொகை செலுத்தினால் உங்கள் ரீசார்ஜுடன் பொருத்த முடியாது.</>
                    : <>Pay exactly <b>{amountText}</b> to <b>{payee}</b> with any UPI app. A different amount cannot be matched to your recharge.</>}
                  next={<>{t('come back here and enter the 12-digit UPI reference of the payment.', 'இங்கே திரும்பி வந்து, பணம் செலுத்தியதன் 12 இலக்க UPI குறிப்பு எண்ணை உள்ளிடுங்கள்.')}</>}
                />
                {onPhone && settings.upiAppButtons ? (
                  <>
                    <p className="text-sm font-semibold text-stone-700">{t('Tap your UPI app:', 'உங்கள் UPI செயலியைத் தட்டுங்கள்:')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {upiAppLinks(link, phone).map((option, index) => (
                        <a key={option.app} href={option.href} onClick={() => { wentToPay.current = true }}
                          className={`flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-1.5 text-center text-[13px] font-bold whitespace-nowrap text-brand-700 sm:text-sm active:bg-brand-50 ${index < 3 ? '' : 'col-span-3'}`}>
                          {option.app}
                        </a>
                      ))}
                    </div>
                    <p className="text-xs text-stone-500">{t('If nothing opens, that app is not on this phone: try another, or copy the UPI ID below.', 'எதுவும் திறக்கவில்லை என்றால், அந்தச் செயலி இந்த போனில் இல்லை: வேறு ஒன்றை முயற்சி செய்யுங்கள், அல்லது கீழே உள்ள UPI ID-ஐ நகலெடுங்கள்.')}</p>
                  </>
                ) : onPhone ? (
                  // UPI accepts a scan of the business QR, also from a photo, where it declines link payments.
                  <ol className="space-y-3">
                    <li className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-sm font-bold text-stone-800">{qrSaved ? '✓' : 'a.'} {t('Save the QR to your phone', 'QR-ஐ உங்கள் போனில் சேமியுங்கள்')}</p>
                      <p className="mb-2 text-xs text-stone-500">{t(`It is saved as a picture named “Pay ${amountText}”.`, `இது “${amountText} செலுத்துங்கள்” என்ற பெயரில் படமாகச் சேமிக்கப்படும்.`)}</p>
                      <UpiQr link={link} amountInr={chosen} payee={payee} primary onSaved={() => { setQrSaved(true); wentToPay.current = true }} />
                    </li>
                    <li className={`rounded-2xl p-3 ${qrSaved ? 'bg-brand-50 ring-1 ring-brand-100' : 'bg-stone-50'}`}>
                      <p className="text-sm font-bold text-stone-800">b. {t('Scan it from your UPI app', 'உங்கள் UPI செயலியில் அதை ஸ்கேன் செய்யுங்கள்')}</p>
                      <p className="text-sm text-stone-700">
                        {ta ? (
                          <><b>PhonePe, Paytm, Google Pay அல்லது BHIM</b>-ஐத் திறங்கள் → <b>Scan</b> என்பதைத் தட்டுங்கள் → ஸ்கேன் திரையில் உள்ள <b>கேலரி / புகைப்படம்</b> ஐகானைத் தட்டுங்கள் → சேமித்த QR-ஐத் தேர்ந்தெடுங்கள்.</>
                        ) : (
                          <>Open <b>PhonePe, Paytm, Google Pay or BHIM</b> → tap <b>Scan</b> → tap the <b>gallery / photo</b> icon on the
                          scan screen → choose the saved QR.</>
                        )}
                      </p>
                    </li>
                    <li className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-sm font-bold text-stone-800">c. {t(`Pay ${amountText}`, `${amountText} செலுத்துங்கள்`)}</p>
                      <p className="text-sm text-stone-700">{ta
                        ? <>பெயர் <b>{payee}</b> என்றும் தொகை <b>{amountText}</b> என்றும் இருக்கிறதா என்று பார்த்து, பிறகு செலுத்துங்கள். அதன் பிறகு இந்தச் செயலிக்குத் திரும்பி வாருங்கள்.</>
                        : <>Check the name says <b>{payee}</b> and the amount is <b>{amountText}</b>, then pay. Come back to this app afterwards.</>}</p>
                    </li>
                  </ol>
                ) : (
                  <div className="rounded-2xl bg-stone-50 p-3 text-center text-sm">
                    <p className="mb-2 font-bold">{t('Scan this QR with any UPI app on your phone', 'உங்கள் போனில் உள்ள ஏதேனும் UPI செயலியில் இந்த QR-ஐ ஸ்கேன் செய்யுங்கள்')}</p>
                    <UpiQr link={link} amountInr={chosen} payee={payee} />
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 text-sm text-stone-600">
                  <span className="min-w-0 truncate">{t('Or pay to UPI ID', 'அல்லது இந்த UPI ID-க்குச் செலுத்துங்கள்')} <span className="select-all font-mono">{settings.upiId}</span></span>
                  <button type="button" onClick={copyUpiId} className="shrink-0 rounded-full border border-brand-200 px-3 py-1 text-xs font-bold text-brand-700">{t('Copy', 'நகலெடு')}</button>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <Button variant="ghost" onClick={() => go('amount')}>{t('← Back', '← பின்செல்')}</Button>
                  <Button onClick={() => go('reference')}>{t('I have paid → Next', 'செலுத்திவிட்டேன் → அடுத்து')}</Button>
                </div>
              </>
            )}

            {step === 'reference' && (
              <form onSubmit={submit} className="space-y-4">
                <Guide
                  now={ta
                    ? <>உங்கள் UPI செயலியில், இப்போது செலுத்திய <b>{amountText}</b> பணத்தைத் திறந்து அதன் <b>12 இலக்க UPI குறிப்பு எண்ணை</b> நகலெடுங்கள். பிறகு <b>ஒட்டு</b> என்பதைத் தட்டுங்கள்.</>
                    : <>In your UPI app, open the payment of <b>{amountText}</b> you just made and copy its <b>12-digit UPI reference</b>. Then tap <b>Paste</b>.</>}
                  next={<>{t(`we match it with the bank and add your ${quote.ok ? quote.credits : ''} credits, usually within minutes.`, `நாங்கள் அதை வங்கியுடன் சரிபார்த்து உங்கள் ${quote.ok ? quote.credits : ''} கிரெடிட்களைச் சேர்ப்போம், பொதுவாகச் சில நிமிடங்களில்.`)}</>}
                />
                <div className="flex gap-2">
                  <input inputMode="numeric" autoComplete="off" value={utr} placeholder={t('e.g. 629912345678', 'எ.கா. 629912345678')} aria-label={t('UPI reference (UTR)', 'UPI குறிப்பு எண் (UTR)')}
                    onChange={event => setUtr(event.target.value.replace(/[^\d ]/g, '').slice(0, 15))}
                    className="min-h-12 min-w-0 flex-1 rounded-2xl border border-stone-300 px-3 text-center text-base font-bold tracking-wider outline-none focus:border-brand-500 sm:text-lg sm:tracking-widest" />
                  {canPaste && <Button variant="secondary" onClick={pasteUtr} className="shrink-0 px-4">{t('Paste', 'ஒட்டு')}</Button>}
                </div>
                <details className="text-sm text-stone-600" open={!utr}>
                  <summary className="cursor-pointer font-semibold text-brand-700">{t('Where do I find it?', 'இதை எங்கே பார்ப்பது?')}</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>PhonePe: {t('open the payment', 'பணம் செலுத்தியதைத் திறங்கள்')} → <b>UTR</b></li>
                    <li>Paytm: {t('open the payment', 'பணம் செலுத்தியதைத் திறங்கள்')} → <b>UPI Ref No.</b></li>
                    <li>Google Pay: {t('open the payment', 'பணம் செலுத்தியதைத் திறங்கள்')} → <b>UPI transaction ID</b></li>
                    <li>{ta
                      ? <>BHIM அல்லது வங்கிச் செயலி: <b>UPI reference</b> அல்லது <b>RRN</b> (12 இலக்கங்கள்)</>
                      : <>BHIM or bank app: the <b>UPI reference</b> or <b>RRN</b> (12 digits)</>}</li>
                  </ul>
                </details>
                {error && <Notice tone="error">{error}</Notice>}
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <Button variant="ghost" onClick={() => go('pay')}>{t('← Back', '← பின்செல்')}</Button>
                  <Button type="submit" busy={busy} disabled={!quote.ok}>{t('Add my credits', 'என் கிரெடிட்களைச் சேர்')}</Button>
                </div>
              </form>
            )}

            {step === 'done' && result && (
              <div className="space-y-4 text-center">
                {result.status === 'APPROVED' ? (
                  <>
                    <p className="text-5xl" aria-hidden="true">🎉</p>
                    <p className="text-xl font-black text-emerald-700">{t(`${result.credits} credits added`, `${result.credits} கிரெடிட்கள் சேர்க்கப்பட்டன`)}</p>
                    <p className="text-sm text-stone-600">{t(`Thank you! Your payment of ${formatInr(result.amountInr)} is confirmed.`, `நன்றி! நீங்கள் செலுத்திய ${formatInr(result.amountInr)} உறுதி செய்யப்பட்டது.`)}</p>
                  </>
                ) : result.status === 'PENDING' ? (
                  <>
                    <p className="text-5xl" aria-hidden="true">⏳</p>
                    <p className="text-xl font-black">{t('Checking your payment', 'உங்கள் பணத்தைச் சரிபார்க்கிறோம்')}</p>
                    <p className="text-sm text-stone-600">
                      {ta ? (
                        <>UPI குறிப்பு எண் <b>{result.utr}</b>-ஐ வங்கியுடன் சரிபார்க்கிறோம். பொதுவாக இதற்குச் சில நிமிடங்கள், அதிகபட்சம் சில
                        மணிநேரங்கள் ஆகும். நீங்கள் செயலியைத் தொடர்ந்து பயன்படுத்தலாம்: உங்கள் {result.credits} கிரெடிட்கள் தானாகவே இங்கே வந்துவிடும்.</>
                      ) : (
                        <>We are matching UPI reference <b>{result.utr}</b> with the bank. This usually takes a few minutes, at most a few
                        hours. You can keep using the app: your {result.credits} credits appear here by themselves.</>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-5xl" aria-hidden="true">😕</p>
                    <p className="text-xl font-black text-red-700">{t('Payment not found', 'பணம் செலுத்தியது கிடைக்கவில்லை')}</p>
                    <p className="text-sm text-stone-600">
                      {result.rejectionReason ?? t('We could not find this payment.', 'இந்தப் பணம் செலுத்தியதை எங்களால் கண்டுபிடிக்க முடியவில்லை.')}{' '}
                      {t(`If money left your account, contact us with the UPI reference: ${COMPANY.supportPhone}.`, `உங்கள் கணக்கிலிருந்து பணம் போயிருந்தால், UPI குறிப்பு எண்ணுடன் எங்களைத் தொடர்பு கொள்ளுங்கள்: ${COMPANY.supportPhone}.`)}
                    </p>
                  </>
                )}
                <div className="grid grid-cols-1 gap-2">
                  {onTryOn && <Button onClick={onTryOn} className="w-full">{t('Start trying on', 'அணிந்து பார்க்கத் தொடங்கு')}</Button>}
                  <Button variant="secondary" onClick={startAgain} className="w-full">{t('Make another recharge', 'இன்னொரு ரீசார்ஜ் செய்')}</Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {recharges.length > 0 && (
        <Card title={t('Your recharges', 'உங்கள் ரீசார்ஜ்கள்')}>
          <ul className="divide-y divide-stone-100">
            {recharges.map(recharge => (
              <li key={recharge.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0">
                  <b>{formatInr(recharge.amountInr)}</b> · {t(`${recharge.credits} credits`, `${recharge.credits} கிரெடிட்கள்`)}
                  <span className="block truncate text-xs text-stone-500">
                    {formatWhen(recharge.createdAt)} · UTR {recharge.utr}{recharge.rejectionReason ? ` · ${recharge.rejectionReason}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[recharge.status].className}`}>{t(STATUS[recharge.status].label, STATUS[recharge.status].labelTa)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">{t(`Paid but not added after a day? Contact us: ${settings.supportContact ?? COMPANY.supportPhone}`, `பணம் செலுத்தி ஒரு நாள் ஆகியும் சேர்க்கப்படவில்லையா? எங்களைத் தொடர்பு கொள்ளுங்கள்: ${settings.supportContact ?? COMPANY.supportPhone}`)}</p>
        </Card>
      )}
    </div>
  )
}
