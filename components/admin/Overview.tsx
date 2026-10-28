'use client'

import { CategoryBars, MoneyChart, StatTile } from '@/components/admin/charts'
import { money, PERIOD_LABELS, type Analytics, type Period } from '@/components/admin/types'
import { Card, Notice, Spinner } from '@/components/ui'

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Period">
      {(Object.keys(PERIOD_LABELS) as Period[]).map(period => (
        <button
          key={period}
          type="button"
          role="radio"
          aria-checked={value === period}
          onClick={() => onChange(period)}
          className={`min-h-9 rounded-full px-3.5 text-sm font-bold ${value === period ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200'}`}
        >
          {PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  )
}

export default function Overview({ data, loading, error, onOpenPayments }: {
  data: Analytics | null
  loading: boolean
  error: string
  onOpenPayments: () => void
}) {
  if (error && !data) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="flex justify-center py-16 text-brand-600"><Spinner className="h-8 w-8" /></div>

  const t = data.totals
  const earned = t.receivedInr - t.aiCostInr
  const perPicture = t.pictures ? t.aiCostInr / t.pictures : 0
  const creditsUsed = t.freeCreditsUsed + t.paidCreditsUsed

  return (
    <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {t.pendingRecharges > 0 && (
        <Notice tone="warning">
          <b>{t.pendingRecharges} recharge{t.pendingRecharges === 1 ? '' : 's'} ({money(t.pendingInr)})</b> waiting for you to check.{' '}
          <button type="button" onClick={onOpenPayments} className="font-extrabold underline">Open Payments</button>
        </Notice>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Money">
        <StatTile hero label="Earned" value={money(earned)} hint="Money received minus AI cost, in this period" />
        <StatTile label="Money received" value={money(t.receivedInr)} hint={`${t.recharges} recharge${t.recharges === 1 ? '' : 's'} · ${t.autoVerifiedRecharges} verified automatically`} />
        <StatTile label="AI cost" value={money(t.aiCostInr)} hint={`${money(perPicture)} a picture · ${money(t.freeAiCostInr)} on free credits`} />
        <StatTile label="Credits used, at what customers paid" value={money(t.valueOfCreditsUsedInr)} hint={`${t.paidCreditsUsed} paid credits × ${money(t.averagePricePerCreditInr)} average price`} />
        <StatTile label="Owed to customers" value={money(t.unusedCreditsValueInr)} hint={`${t.unusedPaidCredits.toLocaleString('en-IN')} paid credits not used yet (all time)`} />
        <StatTile label="Received, all time" value={money(t.receivedEverInr)} hint={`${t.payingCustomersEver} paying customer${t.payingCustomersEver === 1 ? '' : 's'}`} />
      </section>

      <Card title={`Money received and AI cost, per ${data.unit}`}>
        <MoneyChart series={data.series} unit={data.unit} />
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Customers and pictures">
        <StatTile label="Customers" value={t.customers.toLocaleString('en-IN')} hint={`${t.newCustomers} new in this period`} />
        <StatTile label="Active customers" value={t.activeCustomers} hint="Made a picture in this period" />
        <StatTile label="Paying customers" value={t.payingCustomers} hint="Recharged in this period" />
        <StatTile label="Pictures made" value={t.pictures} hint={`${t.pairPictures} pairs · ${t.failedPictures} failed (refunded)`} />
        <StatTile label="Credits used" value={creditsUsed} hint={`${t.freeCreditsUsed} free · ${t.paidCreditsUsed} paid`} />
        <StatTile label="Credits sold" value={t.creditsSold} hint={`${money(t.averagePricePerCreditInr)} average price a credit (all time)`} />
        <StatTile label="Bank alerts not claimed" value={t.unmatchedAlerts} hint="Payments no customer has entered yet" />
      </section>

      <Card title="What people try on">
        <CategoryBars categories={data.categories} />
        <p className="mt-3 text-xs text-stone-500">F = from unstitched fabric · S = from a stitched dress. A pair counts under its main garment.</p>
      </Card>

      <p className="text-xs text-stone-500">
        AI cost is worked out from the tokens OpenAI reported for each picture and the AI prices in Settings. Check those
        against openai.com/api/pricing; changing them recalculates every report.
      </p>
    </div>
  )
}
