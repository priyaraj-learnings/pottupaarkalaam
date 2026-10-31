import type { AppSettings } from '@/lib/client/types'

// What the admin API returns (lib/server/admin.ts and the SQL report functions).

export type Period = 'this-month' | 'last-month' | 'last-7-days' | 'last-30-days' | 'all'

export const PERIOD_LABELS: Record<Period, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-7-days': 'Last 7 days',
  'last-30-days': 'Last 30 days',
  all: 'All time',
}

export type SeriesPoint = {
  bucket: string
  receivedInr: number
  aiCostInr: number
  pictures: number
  newCustomers: number
}

export type Analytics = {
  period: Period
  from: string
  to: string
  unit: 'day' | 'month'
  totals: {
    receivedInr: number
    recharges: number
    autoVerifiedRecharges: number
    creditsSold: number
    aiCostInr: number
    freeAiCostInr: number
    pictures: number
    pairPictures: number
    failedPictures: number
    freeCreditsUsed: number
    paidCreditsUsed: number
    valueOfCreditsUsedInr: number
    averagePricePerCreditInr: number
    customers: number
    newCustomers: number
    activeCustomers: number
    payingCustomers: number
    payingCustomersEver: number
    unusedPaidCredits: number
    unusedCreditsValueInr: number
    pendingRecharges: number
    pendingInr: number
    unmatchedAlerts: number
    receivedEverInr: number
  }
  series: SeriesPoint[]
  categories: Array<{ category: string; pictures: number; fabric: number; stitched: number }>
  // Website visits (lib/server/visits.ts); null before the visits migration.
  visits: {
    // Each visitor once a day: someone who comes on two days counts twice.
    visitors: number
    pageViews: number
    // Added a first photo (counted once a day each, like visitors).
    starts: number
    // The first day with any visit in the period (counting started 30 Oct 2026).
    firstDay: string | null
    days: Array<{ day: string; visitors: number }>
  } | null
}

export type AiRates = {
  usdToInr: number
  textInputUsdPerMillion: number
  imageInputUsdPerMillion: number
  outputUsdPerMillion: number
}

export type Recharge = {
  id: string
  user_id: string | null
  user_email: string | null
  amount_inr: number
  credits: number
  rate_inr?: number
  utr: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  auto_verified: boolean
  created_at: string
  reviewed_at: string | null
  rejection_reason: string | null
  bank_amount_inr?: number | null
}

export type Overview = {
  settings: AppSettings
  aiRates: AiRates
  pending: Recharge[]
  recent: Recharge[]
  unmatchedAlerts: Array<{ id: string; utr: string; amount_inr: number; sender: string | null; message: string | null; received_at: string }>
  paymentSms: { secretSet: boolean; senders: string[]; lastAlertAt: string | null }
  phoneLogin: { widgetId: string; tokenAuth: string; authKeySet: boolean }
  // Telegram alerts for recharges to check: chatName null until connected.
  telegram: { tokenSet: boolean; chatName: string | null }
}

export type CustomerRow = {
  userId: string
  email: string | null
  name: string | null
  provider: string | null
  phone: string | null
  offersOk: boolean
  joinedAt: string
  lastSignInAt: string | null
  lastPictureAt: string | null
  credits: number
  freeLeft: number
  paidInr: number
  recharges: number
  pendingRecharges: number
  pictures: number
  failedPictures: number
  aiCostInr: number
  earnedInr: number
}

export type CustomerDetail = {
  user: {
    userId: string
    email: string | null
    name: string | null
    provider: string | null
    phone: string | null
    offersOk: boolean
    phoneUpdatedAt: string | null
    joinedAt: string
    lastSignInAt: string | null
    credits: number
    freeLeft: number
    termsAcceptedAt: string | null
  }
  totals: { paidInr: number; pictures: number; aiCostInr: number }
  recharges: Array<{
    id: string
    amountInr: number
    credits: number
    rateInr: number
    utr: string
    status: Recharge['status']
    autoVerified: boolean
    createdAt: string
    reviewedAt: string | null
    rejectionReason: string | null
  }>
  pictures: Array<{
    id: string
    createdAt: string
    kind: 'SINGLE' | 'PAIR' | 'COUPLE'
    garments: Array<{ category: string; source: 'FABRIC' | 'STITCHED' }>
    credits: number
    freeCreditsUsed: number
    paidCreditsUsed: number
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    aiCostInr: number
    error: string | null
    refunded: boolean
  }>
  ledger: Array<{ kind: string; credits: number; freeCredits: number; balanceAfter: number; reason: string | null; createdAt: string }>
}

// Rupees for money tiles: paise for small amounts (AI cost per picture), whole
// rupees from Rs 100.
export function money(amount: number) {
  const value = Number(amount) || 0
  if (Math.abs(value) < 100) return `${value < 0 ? '-' : ''}₹${Math.abs(value).toFixed(2)}`
  return `${value < 0 ? '-' : ''}₹${Math.round(Math.abs(value)).toLocaleString('en-IN')}`
}

// Axis ticks: ₹0, ₹500, ₹1.5K, ₹2L.
export function compactMoney(amount: number) {
  const value = Number(amount) || 0
  if (value >= 100_000) return `₹${trim(value / 100_000)}L`
  if (value >= 1000) return `₹${trim(value / 1000)}K`
  return `₹${trim(value)}`
}

function trim(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, '')
}

export function bucketLabel(bucket: string, unit: 'day' | 'month', withYear = false) {
  const date = new Date(`${bucket}T00:00:00`)
  return unit === 'month'
    ? date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : date.toLocaleDateString('en-IN', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' })
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  // Leading =, + (a mobile number too), - or @ would run as a formula in Excel.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function downloadCsv(fileName: string, header: string[], rows: unknown[][]) {
  const lines = [header, ...rows].map(row => row.map(csvCell).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
