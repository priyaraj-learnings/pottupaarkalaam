import type { Recharge } from '@/components/admin/types'

// The tiles over "All payments" (/admin → Payments): each counts the
// recharges of one kind in the period, and tapping it lists just those.

export type PaymentView = 'ALL' | 'PENDING' | 'AUTO' | 'BY_ADMIN' | 'REJECTED'

export const PAYMENT_VIEWS: Array<{ id: PaymentView; label: string; hint: string }> = [
  { id: 'PENDING', label: 'Checking', hint: 'Waiting for you' },
  { id: 'AUTO', label: 'Added automatically', hint: 'Matched a bank alert' },
  { id: 'BY_ADMIN', label: 'Approved by you', hint: 'Checked by hand' },
  { id: 'REJECTED', label: 'Rejected', hint: 'No credits added' },
  { id: 'ALL', label: 'All payments', hint: 'Everything in the period' },
]

export function inView(row: Recharge, view: PaymentView) {
  if (view === 'ALL') return true
  if (view === 'PENDING') return row.status === 'PENDING'
  if (view === 'REJECTED') return row.status === 'REJECTED'
  return row.status === 'APPROVED' && (view === 'AUTO' ? row.auto_verified : !row.auto_verified)
}

export function viewTotals(rows: Recharge[]): Record<PaymentView, { count: number; amountInr: number }> {
  const totals = Object.fromEntries(PAYMENT_VIEWS.map(view => [view.id, { count: 0, amountInr: 0 }])) as Record<PaymentView, { count: number; amountInr: number }>
  for (const row of rows) {
    for (const view of PAYMENT_VIEWS) {
      if (!inView(row, view.id)) continue
      totals[view.id].count += 1
      totals[view.id].amountInr += row.amount_inr
    }
  }
  return totals
}
