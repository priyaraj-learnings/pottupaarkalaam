import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { visitTotals } from '@/lib/server/admin'
import { clientIpFromHeaders } from '@/lib/server/clientIp'
import { indiaDay, isBot, visitorCode } from '@/lib/server/visits'

describe('website visit counting', () => {
  const phone = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'

  it('gives a visitor the same code all day and a different one the next day', () => {
    const today = visitorCode('203.0.113.9', phone, '2026-10-30', 'secret')
    expect(today).toMatch(/^[0-9a-f]{64}$/)
    expect(visitorCode('203.0.113.9', phone, '2026-10-30', 'secret')).toBe(today)
    expect(visitorCode('203.0.113.9', phone, '2026-10-31', 'secret')).not.toBe(today)
    expect(visitorCode('203.0.113.10', phone, '2026-10-30', 'secret')).not.toBe(today)
    expect(today).not.toContain('203')
  })

  it('uses the India date', () => {
    expect(indiaDay(new Date('2026-10-30T18:29:00Z'))).toBe('2026-10-30')
    expect(indiaDay(new Date('2026-10-30T18:31:00Z'))).toBe('2026-10-31')
  })

  it('does not count crawlers, link previews or scripts', () => {
    expect(isBot(phone)).toBe(false)
    for (const agent of ['', 'Googlebot/2.1', 'WhatsApp/2.23', 'facebookexternalhit/1.1', 'curl/8.4', 'HeadlessChrome/120', 'python-requests/2.31']) {
      expect(isBot(agent), agent).toBe(true)
    }
  })

  it('takes the visitor address that Google and Firebase Hosting vouch for, not a forged one', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9, 151.101.1.1' })
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.9')
    expect(clientIpFromHeaders(new Headers())).toBe('unknown')
  })

  it('adds up visitors and page views for the admin, or nothing before the migration', () => {
    expect(visitTotals(null)).toBeNull()
    expect(visitTotals([
      { day: '2026-10-30', visitors: 12, page_views: 30 },
      { day: '2026-10-31', visitors: 8, page_views: 11 },
    ])).toEqual({ visitors: 20, pageViews: 41, firstDay: '2026-10-30', days: [{ day: '2026-10-30', visitors: 12 }, { day: '2026-10-31', visitors: 8 }] })
  })
})
