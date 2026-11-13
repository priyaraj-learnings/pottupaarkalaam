import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { allowRequest, resetRateLimits } from '@/lib/server/rateLimit'

describe('per-address limits', () => {
  it('allows up to the limit in the window, then again after it', () => {
    resetRateLimits()
    const now = 1_000_000
    for (let call = 0; call < 3; call += 1) expect(allowRequest('route:1.2.3.4', 3, 60_000, now)).toBe(true)
    expect(allowRequest('route:1.2.3.4', 3, 60_000, now + 10)).toBe(false)
    expect(allowRequest('route:5.6.7.8', 3, 60_000, now + 10)).toBe(true)
    expect(allowRequest('route:1.2.3.4', 3, 60_000, now + 60_001)).toBe(true)
  })
})
