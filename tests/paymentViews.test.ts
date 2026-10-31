import { describe, expect, it } from 'vitest'

import { inView, viewTotals } from '@/components/admin/paymentViews'
import type { Recharge } from '@/components/admin/types'

const recharge = (id: string, status: Recharge['status'], amount: number, auto = false) =>
  ({ id, user_id: null, user_email: 'a@b.c', amount_inr: amount, credits: amount / 8, utr: '600000000000', status, auto_verified: auto, created_at: '', reviewed_at: null, rejection_reason: null } as Recharge)

describe('payment tiles', () => {
  const rows = [
    recharge('1', 'APPROVED', 400, true),
    recharge('2', 'APPROVED', 800, false),
    recharge('3', 'APPROVED', 160, true),
    recharge('4', 'REJECTED', 100),
    recharge('5', 'PENDING', 240),
  ]

  it('counts each kind and its amount, and All counts everything', () => {
    expect(viewTotals(rows)).toEqual({
      PENDING: { count: 1, amountInr: 240 },
      AUTO: { count: 2, amountInr: 560 },
      BY_ADMIN: { count: 1, amountInr: 800 },
      REJECTED: { count: 1, amountInr: 100 },
      ALL: { count: 5, amountInr: 1700 },
    })
  })

  it('lists exactly the payments a tile counts', () => {
    expect(rows.filter(row => inView(row, 'AUTO')).map(row => row.id)).toEqual(['1', '3'])
    expect(rows.filter(row => inView(row, 'BY_ADMIN')).map(row => row.id)).toEqual(['2'])
  })
})
