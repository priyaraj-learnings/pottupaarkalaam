'use client'

import type { Session } from '@supabase/supabase-js'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import Couple from '@/components/Couple'
import { DeleteAccount } from '@/components/DeleteAccount'
import History from '@/components/History'
import { InstallApp } from '@/components/InstallApp'
import { LanguageSwitch, LanguageToggle } from '@/components/LanguageSwitch'
import { LegalOverlay, type LegalDoc } from '@/components/LegalOverlay'
import { LogoMark, Wordmark } from '@/components/Logo'
import MobileAsk, { MobileForm, savePhone, shouldAskForMobile, VerifyMobile, VerifyMobileForm } from '@/components/MobileNumber'
import Recharge from '@/components/Recharge'
import GuestApp from '@/components/GuestApp'
import { EmailChoices, InviteCard, useReferralClaim } from '@/components/Growth'
import TermsConsent from '@/components/TermsConsent'
import TryOn from '@/components/TryOn'
import { Button, Notice, Sheet, Spinner, ToastProvider, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { useT } from '@/lib/client/language'
import { captureReferral } from '@/lib/client/referral'
import { COMPANY } from '@/lib/legal'
import type { Account, AppSettings, Me } from '@/lib/client/types'
import { formatMobile, termsDue, TERMS_VERSION } from '@/lib/rules'
import { supabase } from '@/lib/supabase/browser'
import { customerCode } from '@/lib/upi'

type Tab = 'tryon' | 'couple' | 'history' | 'recharge'

const TABS: Array<{ id: Tab; label: string; ta: string; icon: string }> = [
  { id: 'tryon', label: 'Try on', ta: 'அணிந்து பார்', icon: '✨' },
  { id: 'couple', label: 'Couple', ta: 'ஜோடி', icon: '💑' },
  { id: 'history', label: 'My pictures', ta: 'என் படங்கள்', icon: '🖼️' },
  { id: 'recharge', label: 'Recharge', ta: 'ரீசார்ஜ்', icon: '💳' },
]

// The customer's "Couple pictures" switch (shown when the admin offers them).
function CoupleRow({ account, settings, onAccount, onTurnedOn }: {
  account: Account
  settings: AppSettings
  onAccount: (account: Account) => void
  onTurnedOn: () => void
}) {
  const toast = useToast()
  const t = useT()
  const [busy, setBusy] = useState(false)

  async function set(on: boolean) {
    setBusy(true)
    try {
      onAccount((await api<{ account: Account }>('/api/me/couple', { method: 'PUT', json: { on } })).account)
      if (on) onTurnedOn()
    } catch (coupleError) {
      toast(errorMessage(coupleError), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="flex items-start gap-3 rounded-2xl p-4 ring-1 ring-stone-200">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">💑 {t('Couple pictures', 'ஜோடிப் படங்கள்')}</span>
        <span className="block text-xs text-stone-600">
          {t(
            `Adds a Couple tab: one picture of you and your partner, each in new clothes. ${settings.couple.credits} paid credits a picture (free credits can’t be used).`,
            `ஜோடி என்ற பகுதி சேரும்: நீங்களும் உங்கள் துணையும் புது உடையில் இருக்கும் ஒரு படம். ஒரு படத்திற்கு ${settings.couple.credits} கட்டண கிரெடிட்கள் (இலவச கிரெடிட்களைப் பயன்படுத்த முடியாது).`,
          )}
        </span>
      </span>
      <input type="checkbox" role="switch" checked={account.coupleOptIn} disabled={busy} onChange={event => void set(event.target.checked)}
        className="mt-0.5 h-6 w-6 shrink-0 accent-brand-600" />
    </label>
  )
}

function MobileRow({ account, widget, onAccount }: {
  account: Account
  widget: { widgetId: string; tokenAuth: string } | null
  onAccount: (account: Account) => void
}) {
  const toast = useToast()
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  async function setOffers(offersOk: boolean) {
    setBusy(true)
    try {
      onAccount((await savePhone({ phone: account.phone, offersOk })).account)
    } catch (offersError) {
      toast(errorMessage(offersError), 'error')
    } finally {
      setBusy(false)
    }
  }

  const done = (next: Account) => {
    onAccount(next)
    setEditing(false)
    toast(next.phone ? t('Mobile number saved.', 'மொபைல் எண் சேமிக்கப்பட்டது.') : t('Mobile number removed.', 'மொபைல் எண் நீக்கப்பட்டது.'))
  }

  // Where MSG91 is set up, numbers are only added or changed by verifying them
  // (free credits need a verified one).
  const verifyNew = Boolean(widget)

  return (
    <div className="rounded-2xl p-4 ring-1 ring-stone-200">
      {editing ? (
        verifyNew && widget
          ? <VerifyMobileForm account={account} widget={widget} onVerified={done} onCancel={() => setEditing(false)} />
          : <MobileForm account={account} onCancel={() => setEditing(false)} onSaved={done} />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">{t('Mobile number', 'மொபைல் எண்')}</p>
              <p className="text-sm text-stone-600">
                {account.phone ? `+91 ${formatMobile(account.phone)}` : t('Not added', 'சேர்க்கவில்லை')}
                {account.phoneVerified && <span className="ml-1.5 font-bold text-emerald-700">✓ {t('verified', 'சரிபார்க்கப்பட்டது')}</span>}
              </p>
            </div>
            {(widget || !account.phoneVerified) && (
              <Button variant="secondary" onClick={() => setEditing(true)} className="min-h-10 shrink-0 text-sm">
                {account.phone ? (widget && !account.phoneVerified ? t('Verify', 'சரிபார்') : t('Change', 'மாற்று')) : t('Add', 'சேர்')}
              </Button>
            )}
          </div>
          {account.phone && (
            <label className="flex items-center gap-2 text-xs text-stone-600">
              <input type="checkbox" checked={account.offersOk} disabled={busy} onChange={event => void setOffers(event.target.checked)} className="h-4 w-4 accent-brand-600" />
              {t('Offers on WhatsApp or SMS', 'WhatsApp அல்லது SMS-இல் சலுகைகள்')}
            </label>
          )}
        </div>
      )}
    </div>
  )
}

function Splash() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <LogoMark size={88} />
      <Wordmark large />
      <Spinner className="mt-2 h-6 w-6 text-brand-600" />
    </main>
  )
}

export default function PottuApp() {
  const t = useT()
  // undefined: still reading the saved sign-in.
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<(Me & { userId: string; loadedAt: number }) | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('tryon')
  const [menuOpen, setMenuOpen] = useState(false)
  const [legal, setLegal] = useState<LegalDoc | null>(null)
  const closeLegal = useCallback(() => setLegal(null), [])
  // Shown on the sign-in screen after the account was deleted.
  const [signInNotice, setSignInNotice] = useState('')
  // Worked out when the account first loads, so "Not now" sticks for this visit.
  const [askMobile, setAskMobile] = useState(false)
  const askedMobileFor = useRef<string | null>(null)
  // Opened from a friend's invite link (?ref=CODE), remembered until sign-in.
  const [invited, setInvited] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setInvited(Boolean(captureReferral())), 0)
    return () => clearTimeout(timer)
  }, [])

  // Opened from a "your picture is ready" notification: show My pictures.
  useEffect(() => {
    const url = new URL(window.location.href)
    const timer = url.searchParams.get('tab') === 'history' ? setTimeout(() => setTab('history'), 0) : undefined
    if (timer) {
      url.searchParams.delete('tab')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'open-history') setTab('history')
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      if (timer) clearTimeout(timer)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [])

  useEffect(() => {
    // Also fires once at start with the saved session (INITIAL_SESSION).
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // Back from Google: drop ?code=… from the address.
      if (event === 'SIGNED_IN' && window.location.search.includes('code=')) {
        window.history.replaceState(null, '', window.location.pathname)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null
  const loadedAt = useRef(0)
  const loadMe = useCallback(async (forUser: string) => {
    try {
      const result = await api<Me>('/api/me')
      loadedAt.current = Date.now()
      setMe({ ...result, userId: forUser, loadedAt: loadedAt.current })
      if (askedMobileFor.current !== forUser) {
        askedMobileFor.current = forUser
        setAskMobile(shouldAskForMobile(result.account, Date.now(), Boolean(result.settings.phoneWidget)))
      }
      setLoadError('')
    } catch (error) {
      setLoadError(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const timer = setTimeout(() => loadMe(userId), 0)
    return () => clearTimeout(timer)
  }, [userId, loadMe])

  // Back to the app after a while (it stays open in the background on phones):
  // refresh credits, and ask for consent if the terms changed meanwhile.
  useEffect(() => {
    if (!userId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > 10 * 60_000) void loadMe(userId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, loadMe])

  const setAccount = useCallback((account: Account) => {
    setMe(current => (current ? { ...current, account } : current))
  }, [])

  const reload = useCallback(() => {
    if (userId) void loadMe(userId)
  }, [userId, loadMe])
  const referral = useReferralClaim(me && me.userId === userId ? me.account : null, reload)

  const signOut = useCallback(async () => {
    setMenuOpen(false)
    await supabase.auth.signOut()
    setMe(null)
    setTab('tryon')
  }, [])

  if (session === undefined) return <Splash />
  // Not signed in: start trying on; sign-in is asked for at "Try on".
  if (!session) return <GuestApp notice={signInNotice} invited={invited} />

  const current = me && me.userId === session.user.id ? me : null
  if (!current) {
    if (!loadError) return <Splash />
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
        <Notice tone="error">{loadError}</Notice>
        <Button onClick={() => loadMe(session.user.id)}>{t('Try again', 'மீண்டும் முயற்சி செய்')}</Button>
        <Button variant="ghost" onClick={signOut}>{t('Sign out', 'வெளியேறு')}</Button>
      </main>
    )
  }

  const termsReason = termsDue(current.account, current.currentTermsVersion ?? TERMS_VERSION, current.loadedAt)
  if (termsReason) {
    return (
      <>
        <TermsConsent reason={termsReason} onAgreed={setAccount} onSignOut={signOut} onOpen={setLegal} />
        <LegalOverlay doc={legal} onClose={closeLegal} />
      </>
    )
  }

  // Free credits go to one verified mobile number a month. Without one the app
  // still opens, with paid credits only.
  if (askMobile && current.settings.phoneWidget && !current.account.phoneVerified) {
    return <VerifyMobile account={current.account} widget={current.settings.phoneWidget} onDone={account => {
      setAccount(account)
      setAskMobile(false)
    }} onSkip={() => setAskMobile(false)} />
  }

  if (askMobile && !current.settings.phoneWidget) {
    return <MobileAsk account={current.account} onDone={account => {
      setAccount(account)
      setAskMobile(false)
    }} />
  }

  const credits = current.account.freeLeft + current.account.credits
  const coupleOn = current.settings.couple.enabled && current.account.coupleOptIn
  const tabs = TABS.filter(item => item.id !== 'couple' || coupleOn)
  const shownTab: Tab = tabs.some(item => item.id === tab) ? tab : 'tryon'

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh max-w-md">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-1.5 bg-ivory/95 px-3 pb-2 min-[400px]:gap-2 min-[400px]:px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <button type="button" onClick={() => setTab('tryon')} className="flex min-w-0 items-center gap-1.5 text-left" aria-label={t('PottuPaarkalaam home', 'PottuPaarkalaam முகப்பு')}>
            <LogoMark size={32} />
            <span className="min-w-0"><Wordmark /></span>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <LanguageToggle />
            <button type="button" onClick={() => setTab('recharge')} className="rounded-full bg-marigold-50 px-3 py-1.5 text-sm font-extrabold text-marigold-900 shadow-sm ring-1 ring-marigold-200"
              aria-label={t(`${credits} credits. Recharge`, `${credits} கிரெடிட்கள். ரீசார்ஜ்`)}>
              🪙 {credits}
            </button>
            <button type="button" onClick={() => setMenuOpen(true)} aria-label={t('Account', 'கணக்கு')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-black text-brand-800">
              {current.user.phone && !current.user.name ? '📱' : (current.user.name ?? current.user.email ?? '?').slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        <main className="px-4 pb-28 pt-2">
          {referral.note && (
            <div className="mb-3">
              <Notice tone={referral.note.tone}>
                <span className="flex items-start justify-between gap-2">
                  <span>{referral.note.text}</span>
                  <button type="button" onClick={referral.dismiss} aria-label={t('Close', 'மூடு')} className="shrink-0 font-black">✕</button>
                </span>
              </Notice>
            </div>
          )}
          <div className={shownTab === 'tryon' ? '' : 'hidden'}>
            <TryOn account={current.account} settings={current.settings} onAccount={setAccount} onRecharge={() => setTab('recharge')}
              onTermsNeeded={() => loadMe(session.user.id)}
              onVerifyMobile={current.settings.phoneWidget ? () => setAskMobile(true) : undefined} />
          </div>
          {coupleOn && (
            <div className={shownTab === 'couple' ? '' : 'hidden'}>
              <Couple account={current.account} settings={current.settings} onAccount={setAccount} onRecharge={() => setTab('recharge')}
                onRefresh={() => loadMe(session.user.id)} />
            </div>
          )}
          <div className={shownTab === 'history' ? '' : 'hidden'}>
            <History active={shownTab === 'history'} onTryOn={() => setTab('tryon')} />
          </div>
          <div className={shownTab === 'recharge' ? '' : 'hidden'}>
            <Recharge active={shownTab === 'recharge'} account={current.account} settings={current.settings} onTryOn={() => setTab('tryon')}
              userCode={customerCode(session.user.id)} onAccount={setAccount} />
          </div>
        </main>

        <nav aria-label={t('Main', 'முதன்மை')} className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className={`mx-auto grid max-w-md ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {tabs.map(item => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={shownTab === item.id ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${shownTab === item.id ? 'text-brand-700' : 'text-stone-500'}`}>
                <span className="text-xl" aria-hidden="true">{item.icon}</span>
                {t(item.label, item.ta)}
              </button>
            ))}
          </div>
        </nav>

        <Sheet open={menuOpen} title={t('Account', 'கணக்கு')} onClose={() => setMenuOpen(false)}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-stone-700">Language / மொழி</span>
              <LanguageSwitch />
            </div>
            <p className="text-sm text-stone-600">{t('Signed in as', 'உள்நுழைந்த கணக்கு:')} <b>{current.user.email ?? (current.user.phone ? `+91 ${formatMobile(current.user.phone)}` : '')}</b></p>
            <p className="text-xs text-stone-500">{t('Your customer code:', 'உங்கள் வாடிக்கையாளர் குறியீடு:')} <b>{customerCode(session.user.id)}</b></p>
            <InviteCard account={current.account} maxFriends={current.settings.referralMaxPerPerson} />
            <MobileRow account={current.account} widget={current.settings.phoneWidget} onAccount={setAccount} />
            {current.user.email && <EmailChoices account={current.account} onAccount={setAccount} />}
            {current.settings.couple.enabled && (
              <CoupleRow account={current.account} settings={current.settings} onAccount={setAccount} onTurnedOn={() => {
                setMenuOpen(false)
                setTab('couple')
              }} />
            )}
            <InstallApp />
            <nav className="flex flex-col divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
              {current.isAdmin && <Link href="/admin" className="px-4 py-3 font-semibold text-brand-700">Admin</Link>}
              <button type="button" onClick={() => setLegal('terms')} className="flex items-center justify-between px-4 py-3 text-left font-semibold">{t('Terms of Use', 'பயன்பாட்டு விதிமுறைகள்')} <span aria-hidden="true" className="text-stone-400">›</span></button>
              <button type="button" onClick={() => setLegal('privacy')} className="flex items-center justify-between px-4 py-3 text-left font-semibold">{t('Privacy Policy', 'தனியுரிமைக் கொள்கை')} <span aria-hidden="true" className="text-stone-400">›</span></button>
              <a href={COMPANY.supportPhoneLink} className="px-4 py-3 text-sm">{t('Customer care:', 'வாடிக்கையாளர் சேவை:')} <b>{COMPANY.supportPhone}</b></a>
              {current.settings.supportContact && <p className="px-4 py-3 text-sm">{t('Help:', 'உதவி:')} {current.settings.supportContact}</p>}
            </nav>
            <Button variant="secondary" onClick={signOut} className="w-full">{t('Sign out', 'வெளியேறு')}</Button>
            <DeleteAccount account={current.account} isAdmin={current.isAdmin} onDeleted={() => {
              setSignInNotice(t('Your account has been deleted. Thank you for trying PottuPaarkalaam.', 'உங்கள் கணக்கு நீக்கப்பட்டது. PottuPaarkalaam-ஐப் பயன்படுத்தியதற்கு நன்றி.'))
              void signOut()
            }} />
          </div>
        </Sheet>
        <LegalOverlay doc={legal} onClose={closeLegal} />
      </div>
    </ToastProvider>
  )
}
