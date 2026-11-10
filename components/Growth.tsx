'use client'

import { useEffect, useRef, useState } from 'react'

import { WhatsAppIcon } from '@/components/LookCard'
import { Button, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { clearPendingReferral, inviteUrl, pendingReferral, rememberMyInviteCode } from '@/lib/client/referral'
import { shareInvite } from '@/lib/client/share'
import type { Account } from '@/lib/client/types'

// =======================================================
// GROWTH: refer a friend, and the customer's email choices
// =======================================================

// The account menu's "Invite friends" card: share the invite link on
// WhatsApp, or copy it.
export function InviteCard({ account, maxFriends }: { account: Account; maxFriends: number }) {
  const toast = useToast()
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
      toast('Invite link copied.')
    } catch {
      toast(`Copy this link: ${link}`)
    }
  }

  return (
    <div className="space-y-2 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
      <p className="text-sm font-extrabold text-emerald-900">🎁 Invite friends: you both get {credits} free pictures</p>
      <p className="text-xs text-emerald-900/80">
        When a friend joins with your link and verifies their mobile number, you each get {credits} credits{maxFriends > 0 ? `, for up to ${maxFriends} friends` : ''}.
        {account.friendsJoined > 0 && <> <b>{account.friendsJoined} joined so far</b>: thank you!</>}
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="whatsapp" busy={busy} onClick={() => void share()} className="min-h-10 text-sm"><WhatsAppIcon /> Invite on WhatsApp</Button>
        <Button variant="secondary" onClick={() => void copy()} className="min-h-10 text-sm">Copy link</Button>
      </div>
    </div>
  )
}

// "Offers and news by email" and "Monthly email", for accounts with an email
// address (not mobile number sign-ins).
export function EmailChoices({ account, onAccount }: { account: Account; onAccount: (account: Account) => void }) {
  const toast = useToast()
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
      <p className="text-sm font-bold">Email</p>
      <label className="flex items-start gap-2 text-xs text-stone-600">
        <input type="checkbox" checked={account.monthlyEmailOk} disabled={busy !== ''} onChange={event => void set('monthly-email', event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
        <span><b className="text-stone-800">Monthly email</b>: on the 1st, when your free pictures are back (if you did not use last month&rsquo;s)</span>
      </label>
      <label className="flex items-start gap-2 text-xs text-stone-600">
        <input type="checkbox" checked={account.emailOffersOk} disabled={busy !== ''} onChange={event => void set('email-offers', event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
        <span><b className="text-stone-800">Send me offers and news by email</b> (new features, festival offers; a few a month at most)</span>
      </label>
    </div>
  )
}

const REFERRAL_NOTES: Record<string, (credits: number) => string> = {
  NOT_VERIFIED: credits => `Your friend's invite is saved: verify your mobile number (menu ☰ → Mobile number) and you both get ${credits} free pictures.`,
}

// After sign-in: a friend's invite link this browser opened goes to the
// account, once. Returns a message to show (and reloads the account when
// credits were given).
export function useReferralClaim(account: Account | null, onRewarded: () => void) {
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
          setNote({ tone: 'success', text: `🎁 ${result.credits} free pictures added: thanks to your friend's invite!` })
          onRewarded()
        } else if (result.reason && REFERRAL_NOTES[result.reason]) {
          setNote({ tone: 'info', text: REFERRAL_NOTES[result.reason](account?.referralCredits || 2) })
        }
      })
      .catch(() => {
        // Kept for the next visit.
        tried.current = false
      })
  }, [accountReady, account?.referralCredits, onRewarded])

  return { note, dismiss: () => setNote(null) }
}
