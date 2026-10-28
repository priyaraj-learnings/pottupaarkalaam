'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import Customers from '@/components/admin/Customers'
import Overview, { PeriodPicker } from '@/components/admin/Overview'
import Payments from '@/components/admin/Payments'
import SettingsTab from '@/components/admin/SettingsTab'
import type { Analytics, Overview as OverviewData, Period } from '@/components/admin/types'
import { LogoMark, Wordmark } from '@/components/Logo'
import { Notice, ToastProvider } from '@/components/ui'
import { api, ApiFailure, errorMessage } from '@/lib/client/api'
import { supabase } from '@/lib/supabase/browser'

type Tab = 'overview' | 'customers' | 'payments' | 'settings'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'customers', label: 'Customers' },
  { id: 'payments', label: 'Payments' },
  { id: 'settings', label: 'Settings' },
]

function NotAllowed({ status }: { status: number }) {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null))
  }, [])
  if (status === 401) {
    return (
      <Notice tone="warning">
        Please sign in first. <Link href="/" className="font-bold underline">Open PottuPaarkalaam</Link>, sign in, then come back to /admin.
      </Notice>
    )
  }
  return (
    <div className="space-y-3">
      <Notice tone="warning">
        {email ? <>You are signed in as <b>{email}</b>, which is not an admin yet.</> : 'This account is not an admin yet.'}
      </Notice>
      <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-stone-200">
        <p className="font-bold">To make this account an admin</p>
        <p className="mt-1 text-stone-600">Supabase → SQL Editor → New query → paste this → Run, then reload this page:</p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-stone-900 p-3 text-xs text-white">
          {`insert into public.app_admins (user_id)\nselect id from auth.users where email = '${email ?? 'you@example.com'}';`}
        </pre>
      </div>
    </div>
  )
}

function AdminConsole() {
  const [tab, setTab] = useState<Tab>('overview')
  const [period, setPeriod] = useState<Period>('this-month')
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [analyticsBusy, setAnalyticsBusy] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [blocked, setBlocked] = useState<number | null>(null)

  const loadAnalytics = useCallback(async (which: Period) => {
    setAnalyticsBusy(true)
    try {
      setAnalytics(await api<Analytics>(`/api/admin/analytics?period=${which}`))
      setAnalyticsError('')
    } catch (error) {
      if (error instanceof ApiFailure && (error.status === 401 || error.status === 403)) setBlocked(error.status)
      setAnalyticsError(errorMessage(error))
    } finally {
      setAnalyticsBusy(false)
    }
  }, [])

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<OverviewData>('/api/admin'))
    } catch (error) {
      if (error instanceof ApiFailure && (error.status === 401 || error.status === 403)) setBlocked(error.status)
    }
  }, [])

  const refresh = useCallback(() => {
    void loadOverview()
    void loadAnalytics(period)
  }, [loadOverview, loadAnalytics, period])

  useEffect(() => {
    const first = setTimeout(() => loadAnalytics(period), 0)
    return () => clearTimeout(first)
  }, [period, loadAnalytics])

  useEffect(() => {
    const first = setTimeout(loadOverview, 0)
    // New recharges and bank alerts arrive all day.
    const timer = setInterval(() => {
      void loadOverview()
    }, 60_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [loadOverview])

  if (blocked) return <NotAllowed status={blocked} />

  const waiting = overview?.pending.length ?? 0

  return (
    <div className="space-y-4">
      <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-stone-200">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold ${tab === item.id ? 'bg-stone-900 text-white' : 'text-stone-600'}`}
          >
            {item.label}
            {item.id === 'payments' && waiting > 0 && (
              <span className="rounded-full bg-amber-400 px-1.5 text-xs font-black text-stone-900">{waiting}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-4">
          <PeriodPicker value={period} onChange={setPeriod} />
          <Overview data={analytics} loading={analyticsBusy} error={analyticsError} onOpenPayments={() => setTab('payments')} />
        </div>
      )}
      <div className={tab === 'customers' ? '' : 'hidden'}>
        <Customers active={tab === 'customers'} />
      </div>
      {tab === 'payments' && <Payments active overview={overview} onChanged={refresh} />}
      {tab === 'settings' && <SettingsTab overview={overview} onSaved={refresh} />}
    </div>
  )
}

export default function AdminPage() {
  return (
    <ToastProvider>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2"><LogoMark size={36} /><Wordmark /></Link>
          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">Admin</span>
        </div>
        <AdminConsole />
      </main>
    </ToastProvider>
  )
}
