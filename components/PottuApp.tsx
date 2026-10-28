'use client'

import type { Session } from '@supabase/supabase-js'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import History from '@/components/History'
import { LegalOverlay, type LegalDoc } from '@/components/LegalOverlay'
import { LogoMark, Wordmark } from '@/components/Logo'
import MobileAsk, { MobileForm, shouldAskForMobile } from '@/components/MobileNumber'
import Recharge from '@/components/Recharge'
import SignIn from '@/components/SignIn'
import TermsConsent from '@/components/TermsConsent'
import TryOn from '@/components/TryOn'
import { Button, Notice, Sheet, Spinner, ToastProvider, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import type { Account, Me } from '@/lib/client/types'
import { formatMobile, TERMS_VERSION } from '@/lib/rules'
import { supabase } from '@/lib/supabase/browser'
import { customerCode } from '@/lib/upi'

type Tab = 'tryon' | 'history' | 'recharge'

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'tryon', label: 'Try on', icon: '✨' },
  { id: 'history', label: 'My pictures', icon: '🖼️' },
  { id: 'recharge', label: 'Recharge', icon: '💳' },
]

function MobileRow({ account, onAccount }: { account: Account; onAccount: (account: Account) => void }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  return (
    <div className="rounded-2xl p-4 ring-1 ring-stone-200">
      {editing ? (
        <MobileForm account={account} onCancel={() => setEditing(false)} onSaved={next => {
          onAccount(next)
          setEditing(false)
          toast(next.phone ? 'Mobile number saved.' : 'Mobile number removed.')
        }} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">Mobile number</p>
            <p className="text-sm text-stone-600">
              {account.phone ? `+91 ${formatMobile(account.phone)}` : 'Not added'}
              {account.phone && <span className="block text-xs text-stone-500">{account.offersOk ? 'Offers on WhatsApp or SMS: yes' : 'No offers'}</span>}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setEditing(true)} className="min-h-10 shrink-0 text-sm">{account.phone ? 'Change' : 'Add'}</Button>
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
  // undefined: still reading the saved sign-in.
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<(Me & { userId: string }) | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('tryon')
  const [menuOpen, setMenuOpen] = useState(false)
  const [legal, setLegal] = useState<LegalDoc | null>(null)
  const closeLegal = useCallback(() => setLegal(null), [])
  // Worked out when the account loads, so "Not now" sticks for this visit.
  const [askMobile, setAskMobile] = useState(false)

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
  const loadMe = useCallback(async (forUser: string) => {
    try {
      const result = await api<Me>('/api/me')
      setMe({ ...result, userId: forUser })
      setAskMobile(shouldAskForMobile(result.account, Date.now()))
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

  const setAccount = useCallback((account: Account) => {
    setMe(current => (current ? { ...current, account } : current))
  }, [])

  const signOut = useCallback(async () => {
    setMenuOpen(false)
    await supabase.auth.signOut()
    setMe(null)
    setTab('tryon')
  }, [])

  if (session === undefined) return <Splash />
  if (!session) return <SignIn />

  const current = me && me.userId === session.user.id ? me : null
  if (!current) {
    if (!loadError) return <Splash />
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
        <Notice tone="error">{loadError}</Notice>
        <Button onClick={() => loadMe(session.user.id)}>Try again</Button>
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </main>
    )
  }

  if (current.account.termsVersion !== TERMS_VERSION) {
    return (
      <>
        <TermsConsent updated={Boolean(current.account.termsVersion)} onAgreed={setAccount} onSignOut={signOut} onOpen={setLegal} />
        <LegalOverlay doc={legal} onClose={closeLegal} />
      </>
    )
  }

  if (askMobile) {
    return <MobileAsk account={current.account} onDone={account => {
      setAccount(account)
      setAskMobile(false)
    }} />
  }

  const credits = current.account.freeLeft + current.account.credits

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh max-w-md">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 bg-ivory/95 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <button type="button" onClick={() => setTab('tryon')} className="flex min-w-0 items-center gap-2 text-left" aria-label="PottuPaarkalaam home">
            <LogoMark size={36} />
            <Wordmark />
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setTab('recharge')} className="rounded-full bg-marigold-50 px-3 py-1.5 text-sm font-extrabold text-marigold-900 shadow-sm ring-1 ring-marigold-200">
              🪙 {credits}
            </button>
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Account"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-black text-brand-800">
              {(current.user.name ?? current.user.email ?? '?').slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        <main className="px-4 pb-28 pt-2">
          <div className={tab === 'tryon' ? '' : 'hidden'}>
            <TryOn account={current.account} onAccount={setAccount} onRecharge={() => setTab('recharge')}
              onTermsNeeded={() => loadMe(session.user.id)} />
          </div>
          <div className={tab === 'history' ? '' : 'hidden'}>
            <History active={tab === 'history'} onTryOn={() => setTab('tryon')} />
          </div>
          <div className={tab === 'recharge' ? '' : 'hidden'}>
            <Recharge active={tab === 'recharge'} account={current.account} settings={current.settings}
              userCode={customerCode(session.user.id)} onAccount={setAccount} />
          </div>
        </main>

        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto grid max-w-md grid-cols-3">
            {TABS.map(item => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${tab === item.id ? 'text-brand-700' : 'text-stone-500'}`}>
                <span className="text-xl" aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <Sheet open={menuOpen} title="Account" onClose={() => setMenuOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-stone-600">Signed in as <b>{current.user.email}</b></p>
            <p className="text-xs text-stone-500">Your customer code: <b>{customerCode(session.user.id)}</b></p>
            <MobileRow account={current.account} onAccount={setAccount} />
            <nav className="flex flex-col divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
              {current.isAdmin && <Link href="/admin" className="px-4 py-3 font-semibold text-brand-700">Admin</Link>}
              <button type="button" onClick={() => setLegal('terms')} className="flex items-center justify-between px-4 py-3 text-left font-semibold">Terms of Use <span aria-hidden="true" className="text-stone-400">›</span></button>
              <button type="button" onClick={() => setLegal('privacy')} className="flex items-center justify-between px-4 py-3 text-left font-semibold">Privacy Policy <span aria-hidden="true" className="text-stone-400">›</span></button>
              {current.settings.supportContact && <p className="px-4 py-3 text-sm">Help: {current.settings.supportContact}</p>}
            </nav>
            <Button variant="secondary" onClick={signOut} className="w-full">Sign out</Button>
          </div>
        </Sheet>
        <LegalOverlay doc={legal} onClose={closeLegal} />
      </div>
    </ToastProvider>
  )
}
