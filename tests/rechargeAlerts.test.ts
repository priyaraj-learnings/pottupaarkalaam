import { describe, expect, it } from 'vitest'

import { newRechargeIds } from '@/components/admin/RechargeAlerts'

describe('new-recharge alerts', () => {
  it('alerts only for recharges not seen before', () => {
    const seen = new Set(['a', 'b'])
    expect(newRechargeIds(seen, [{ id: 'a' }, { id: 'b' }])).toEqual([])
    expect(newRechargeIds(seen, [{ id: 'a' }, { id: 'c' }, { id: 'd' }])).toEqual(['c', 'd'])
    // A recharge approved meanwhile (gone from the list) is not an alert.
    expect(newRechargeIds(seen, [])).toEqual([])
  })
})
