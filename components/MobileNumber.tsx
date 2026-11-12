'use client'

import { useState, type FormEvent } from 'react'

import { LogoMark, Wordmark } from '@/components/Logo'
import { Button, Card, Notice } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { openMsg91Widget } from '@/lib/client/msg91'
import type { Account } from '@/lib/client/types'
import { useT } from '@/lib/client/language'
import { formatMobile, MOBILE_ASK_AGAIN_DAYS, normalizeMobile } from '@/lib/rules'

// Whether to ask for the mobile number after sign-in. Where numbers can be
// verified (MSG91 set up), on every visit until one is: free credits need it.
// Otherwise when never given, and not put off with "Not now" in the last 30 days.
export function shouldAskForMobile(account: Account, now: number, canVerify: boolean) {
  if (canVerify) return !account.phoneVerified
  if (account.phone) return false
  if (!account.phoneAskedAt) return true
  return now - new Date(account.phoneAskedAt).getTime() > MOBILE_ASK_AGAIN_DAYS * 86_400_000
}

export const savePhone = (json: Record<string, unknown>) => api<{ account: Account }>('/api/me/phone', { method: 'PUT', json })

export function MobileForm({ account, onSaved, onSkip, onCancel }: {
  account: Account
  onSaved: (account: Account) => void
  onSkip?: () => void
  onCancel?: () => void
}) {
  const t = useT()
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
      setError(t('Enter your 10-digit mobile number.', 'உங்கள் 10 இலக்க மொபைல் எண்ணை உள்ளிடுங்கள்.'))
      return
    }
    void send({ phone, offersOk })
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm font-bold text-stone-700">
        {t('Mobile number', 'மொபைல் எண்')}
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
        <span>{t('Send me offers and new features on WhatsApp or SMS. I can stop them any time.', 'சலுகைகளையும் புதிய வசதிகளையும் WhatsApp அல்லது SMS-இல் எனக்கு அனுப்புங்கள். எப்போது வேண்டுமானாலும் நிறுத்திக்கொள்ளலாம்.')}</span>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} className="flex-1">{t('Save', 'சேமி')}</Button>
        {onSkip && <Button type="button" variant="ghost" disabled={busy} onClick={onSkip}>{t('Not now', 'இப்போது வேண்டாம்')}</Button>}
        {onCancel && <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{t('Cancel', 'ரத்து')}</Button>}
      </div>
      {account.phone && onCancel && (
        <button type="button" disabled={busy} onClick={() => send({ phone: null })} className="text-sm font-semibold text-red-700 underline">
          {t('Remove my number', 'என் எண்ணை நீக்கு')}
        </button>
      )}
    </form>
  )
}

// Shown once after sign-in (and the terms). The number is optional.
export default function MobileAsk({ account, onDone }: { account: Account; onDone: (account: Account) => void }) {
  const t = useT()
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
      <Card title={t('Add your mobile number', 'உங்கள் மொபைல் எண்ணைச் சேர்க்கவும்')}>
        <p className="mb-4 text-[15px] text-stone-600">
          {t('So we can reach you quickly if a payment or a picture needs sorting out. You can change or remove it any time from the account menu.', 'பணம் செலுத்துவதிலோ படத்திலோ ஏதாவது சரிசெய்ய வேண்டியிருந்தால் உங்களை விரைவாகத் தொடர்பு கொள்ள இது உதவும். கணக்கு மெனுவில் எப்போது வேண்டுமானாலும் இதை மாற்றலாம் அல்லது நீக்கலாம்.')}
        </p>
        <MobileForm account={account} onSaved={onDone} onSkip={skip} />
      </Card>
      <p className="px-1 text-xs text-stone-500">{t('We never sell or share your number. Offers only if you tick the box.', 'உங்கள் எண்ணை நாங்கள் ஒருபோதும் விற்கவோ பகிரவோ மாட்டோம். பெட்டியில் டிக் செய்தால் மட்டுமே சலுகைகள் அனுப்புவோம்.')}</p>
    </main>
  )
}

type Widget = { widgetId: string; tokenAuth: string }

// Verifies a number with an SMS code through the MSG91 widget. The server takes
// the number from MSG91, never from the browser.
export function VerifyMobileForm({ account, widget, onVerified, onCancel }: {
  account: Account
  widget: Widget
  onVerified: (account: Account) => void
  onCancel?: () => void
}) {
  const t = useT()
  const [offersOk, setOffersOk] = useState(account.offersOk)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function finish(accessToken: string) {
    setBusy(true)
    setError('')
    try {
      onVerified((await savePhone({ accessToken, offersOk })).account)
    } catch (verifyError) {
      setError(errorMessage(verifyError))
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    setError('')
    try {
      const identifier = account.phone && !account.phoneVerified ? account.phone.replace('+', '') : undefined
      await openMsg91Widget({ ...widget, identifier }, accessToken => void finish(accessToken), setError)
    } catch (widgetError) {
      setError(errorMessage(widgetError))
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 text-sm text-stone-700">
        <input type="checkbox" checked={offersOk} onChange={event => setOffersOk(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
        <span>{t('Send me offers and new features on WhatsApp or SMS. I can stop them any time.', 'சலுகைகளையும் புதிய வசதிகளையும் WhatsApp அல்லது SMS-இல் எனக்கு அனுப்புங்கள். எப்போது வேண்டுமானாலும் நிறுத்திக்கொள்ளலாம்.')}</span>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={start} className="flex-1"><span aria-hidden="true">📱</span> {t('Verify with SMS code', 'SMS குறியீட்டால் சரிபார்')}</Button>
        {onCancel && <Button variant="ghost" disabled={busy} onClick={onCancel}>{t('Cancel', 'ரத்து')}</Button>}
      </div>
    </div>
  )
}

// Shown after sign-in until the account has a verified mobile number: free
// credits need one. One number belongs to one account, so free credits go to
// one number a month. "Not now" goes into the app with paid credits only.
export function VerifyMobile({ account, widget, onDone, onSkip }: {
  account: Account
  widget: Widget
  onDone: (account: Account) => void
  onSkip: () => void
}) {
  const t = useT()
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <LogoMark size={44} />
        <Wordmark />
      </div>
      <Card title={t('Verify your mobile number', 'உங்கள் மொபைல் எண்ணைச் சரிபார்க்கவும்')}>
        <p className="mb-4 text-[15px] text-stone-600">
          {t(`Your ${account.freeCreditsPerMonth} free credits every month go to one mobile number. Verify yours with an SMS code to get them. We also use it if a payment or a picture needs sorting out.`, `ஒவ்வொரு மாதமும் உங்கள் ${account.freeCreditsPerMonth} இலவச கிரெடிட்கள் ஒரு மொபைல் எண்ணுக்கு மட்டுமே கிடைக்கும். அவற்றைப் பெற உங்கள் எண்ணை SMS குறியீட்டால் சரிபாருங்கள். பணம் செலுத்துவதிலோ படத்திலோ ஏதாவது சரிசெய்ய வேண்டியிருந்தாலும் இதைப் பயன்படுத்துவோம்.`)}
        </p>
        <VerifyMobileForm account={account} widget={widget} onVerified={onDone} />
      </Card>
      <p className="px-1 text-xs text-stone-500">{t('One account per mobile number. We never sell or share your number.', 'ஒரு மொபைல் எண்ணுக்கு ஒரு கணக்கு மட்டுமே. உங்கள் எண்ணை நாங்கள் ஒருபோதும் விற்கவோ பகிரவோ மாட்டோம்.')}</p>
      <Button variant="ghost" onClick={onSkip}>{t('Not now (no free credits; recharge to try on)', 'இப்போது வேண்டாம் (இலவச கிரெடிட்கள் இல்லை; அணிந்து பார்க்க ரீசார்ஜ் செய்யுங்கள்)')}</Button>
    </main>
  )
}
