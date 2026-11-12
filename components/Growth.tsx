'use client'

import { useEffect, useRef, useState } from 'react'

import { WhatsAppIcon } from '@/components/LookCard'
import { Button, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { clearPendingReferral, inviteUrl, pendingReferral, rememberMyInviteCode } from '@/lib/client/referral'
import { shareInvite } from '@/lib/client/share'
import { useLanguage, useT, type Translate } from '@/lib/client/language'
import type { Account } from '@/lib/client/types'

// =======================================================
// GROWTH: refer a friend, and the customer's email choices
// =======================================================

// The account menu's "Invite friends" card: share the invite link on
// WhatsApp, or copy it.
export function InviteCard({ account, maxFriends }: { account: Account; maxFriends: number }) {
  const toast = useToast()
  const t = useT()
  const ta = useLanguage() === 'ta'
  const [busy, setBusy] = useState(false)
  if (!account.referralCode || account.referralCredits <= 0) return null
  const link = inviteUrl(account.referralCode)
  const credits = account.referralCredits

  async function share() {
    setBusy(true)
    try {
      rememberMyInviteCode(account.referralCode)
      await shareInvite()
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast(t('Invite link copied.', 'அழைப்பு இணைப்பு நகலெடுக்கப்பட்டது.'))
    } catch {
      toast(t(`Copy this link: ${link}`, `இந்த இணைப்பை நகலெடுங்கள்: ${link}`))
    }
  }

  return (
    <div className="space-y-2 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
      <p className="text-sm font-extrabold text-emerald-900">{t(`🎁 Invite friends: you both get ${credits} free pictures`, `🎁 நண்பர்களை அழையுங்கள்: உங்கள் இருவருக்கும் ${credits} இலவசப் படங்கள்`)}</p>
      <p className="text-xs text-emerald-900/80">
        {ta
          ? `உங்கள் இணைப்பு மூலம் நண்பர் சேர்ந்து, தன் மொபைல் எண்ணைச் சரிபார்த்தால், உங்கள் ஒவ்வொருவருக்கும் ${credits} கிரெடிட்கள் கிடைக்கும்${maxFriends > 0 ? ` (அதிகபட்சம் ${maxFriends} நண்பர்கள் வரை)` : ''}.`
          : `When a friend joins with your link and verifies their mobile number, you each get ${credits} credits${maxFriends > 0 ? `, for up to ${maxFriends} friends` : ''}.`}
        {account.friendsJoined > 0 && (ta
          ? <> <b>இதுவரை {account.friendsJoined} பேர் சேர்ந்துள்ளனர்</b>: நன்றி!</>
          : <> <b>{account.friendsJoined} joined so far</b>: thank you!</>)}
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="whatsapp" busy={busy} onClick={() => void share()} className="min-h-10 text-sm"><WhatsAppIcon /> {t('Invite on WhatsApp', 'WhatsApp-இல் அழை')}</Button>
        <Button variant="secondary" onClick={() => void copy()} className="min-h-10 text-sm">{t('Copy link', 'இணைப்பை நகலெடு')}</Button>
      </div>
    </div>
  )
}

// "Offers and news by email" and "Monthly email", for accounts with an email
// address (not mobile number sign-ins).
export function EmailChoices({ account, onAccount }: { account: Account; onAccount: (account: Account) => void }) {
  const toast = useToast()
  const t = useT()
  const ta = useLanguage() === 'ta'
  const [busy, setBusy] = useState('')

  async function set(path: 'email-offers' | 'monthly-email', on: boolean) {
    setBusy(path)
    try {
      onAccount((await api<{ account: Account }>(`/api/me/${path}`, { method: 'PUT', json: { on } })).account)
    } catch (choiceError) {
      toast(errorMessage(choiceError), 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-2 rounded-2xl p-4 ring-1 ring-stone-200">
      <p className="text-sm font-bold">{t('Email', 'மின்னஞ்சல்')}</p>
      <label className="flex items-start gap-2 text-xs text-stone-600">
        <input type="checkbox" checked={account.monthlyEmailOk} disabled={busy !== ''} onChange={event => void set('monthly-email', event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
        {ta
          ? <span><b className="text-stone-800">மாதாந்திர மின்னஞ்சல்</b>: ஒவ்வொரு மாதம் 1-ஆம் தேதி, உங்கள் இலவசப் படங்கள் மீண்டும் வரும்போது (கடந்த மாதத்தவற்றை நீங்கள் பயன்படுத்தவில்லை என்றால்)</span>
          : <span><b className="text-stone-800">Monthly email</b>: on the 1st, when your free pictures are back (if you did not use last month&rsquo;s)</span>}
      </label>
      <label className="flex items-start gap-2 text-xs text-stone-600">
        <input type="checkbox" checked={account.emailOffersOk} disabled={busy !== ''} onChange={event => void set('email-offers', event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
        {ta
          ? <span><b className="text-stone-800">சலுகைகளையும் செய்திகளையும் மின்னஞ்சலில் அனுப்புங்கள்</b> (புதிய வசதிகள், பண்டிகைச் சலுகைகள்; மாதத்துக்கு அதிகபட்சம் சில மட்டும்)</span>
          : <span><b className="text-stone-800">Send me offers and news by email</b> (new features, festival offers; a few a month at most)</span>}
      </label>
    </div>
  )
}

const REFERRAL_NOTES: Record<string, (credits: number, t: Translate) => string> = {
  NOT_VERIFIED: (credits, t) => t(
    `Your friend's invite is saved: verify your mobile number (menu ☰ → Mobile number) and you both get ${credits} free pictures.`,
    `உங்கள் நண்பரின் அழைப்பு சேமிக்கப்பட்டது: உங்கள் மொபைல் எண்ணைச் சரிபாருங்கள் (மெனு ☰ → மொபைல் எண்), உங்கள் இருவருக்கும் ${credits} இலவசப் படங்கள் கிடைக்கும்.`,
  ),
}

// After sign-in: a friend's invite link this browser opened goes to the
// account, once. Returns a message to show (and reloads the account when
// credits were given).
export function useReferralClaim(account: Account | null, onRewarded: () => void) {
  const t = useT()
  const [note, setNote] = useState<{ tone: 'success' | 'info'; text: string } | null>(null)
  const tried = useRef(false)
  const accountReady = Boolean(account)

  useEffect(() => {
    if (account) rememberMyInviteCode(account.referralCode)
  }, [account])

  useEffect(() => {
    if (!accountReady || tried.current) return
    const code = pendingReferral()
    if (!code) return
    tried.current = true
    api<{ rewarded: boolean; credits?: number; reason?: string }>('/api/me/referral', { method: 'POST', json: { code } })
      .then(result => {
        clearPendingReferral()
        if (result.rewarded) {
          setNote({ tone: 'success', text: t(`🎁 ${result.credits} free pictures added: thanks to your friend's invite!`, `🎁 ${result.credits} இலவசப் படங்கள் சேர்க்கப்பட்டன: உங்கள் நண்பரின் அழைப்புக்கு நன்றி!`) })
          onRewarded()
        } else if (result.reason && REFERRAL_NOTES[result.reason]) {
          setNote({ tone: 'info', text: REFERRAL_NOTES[result.reason](account?.referralCredits || 2, t) })
        }
      })
      .catch(() => {
        // Kept for the next visit.
        tried.current = false
      })
  }, [accountReady, account?.referralCredits, onRewarded, t])

  return { note, dismiss: () => setNote(null) }
}

const REVIEW_KEY = 'pp-review-asked'

// After the 3rd finished picture, once per phone: "Enjoying PottuPaarkalaam?
// Rate us on Google" (only when the admin saved the review link).
export function ReviewPrompt({ account, reviewUrl }: { account: Account; reviewUrl: string | null }) {
  const t = useT()
  const [asked, setAsked] = useState(() => {
    try {
      return typeof window === 'undefined' || localStorage.getItem(REVIEW_KEY) !== null
    } catch {
      return true
    }
  })
  if (!reviewUrl || asked || account.completedPictures < 3) return null

  const done = (answer: string) => {
    try {
      localStorage.setItem(REVIEW_KEY, answer)
    } catch {
      // Then it may ask again next visit.
    }
    setAsked(true)
  }

  return (
    <div className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-marigold-200">
      <p className="text-2xl" aria-hidden="true">⭐⭐⭐⭐⭐</p>
      <p className="mt-1 font-extrabold">{t('Enjoying PottuPaarkalaam?', 'PottuPaarkalaam பிடித்திருக்கிறதா?')}</p>
      <p className="text-sm text-stone-600">{t('A quick Google review helps other families find us. Thank you!', 'ஒரு சிறிய Google மதிப்பாய்வு மற்ற குடும்பங்கள் எங்களைக் கண்டுபிடிக்க உதவும். நன்றி!')}</p>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <a href={reviewUrl} target="_blank" rel="noopener noreferrer" onClick={() => done('rated')}
          className="brand-gradient inline-flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-bold text-white">
          {t('Rate us on Google', 'Google-இல் மதிப்பிடுங்கள்')}
        </a>
        <Button variant="ghost" onClick={() => done('later')} className="min-h-11 text-sm">{t('Not now', 'இப்போது வேண்டாம்')}</Button>
      </div>
    </div>
  )
}
