import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { firstOfMonthIndia, FROM_ADDRESS, monthlyEmail, monthlySendingOpen, unsubscribeToken, unsubscribeTokenMatches, unsubscribeUrl } from '@/lib/server/email'

afterEach(() => vi.unstubAllEnvs())

describe('monthly email', () => {
  it('uses India time for the month and starts at 10 am on the 1st', () => {
    // 31 Oct 20:00 UTC is 1 Nov 01:30 in India.
    expect(firstOfMonthIndia(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11-01')
    expect(monthlySendingOpen(new Date('2026-10-31T20:00:00Z'))).toBe(false)
    expect(monthlySendingOpen(new Date('2026-11-01T04:30:00Z'))).toBe(true)
    expect(monthlySendingOpen(new Date('2026-11-02T00:00:00Z'))).toBe(true)
  })

  it('says how many free pictures, carries the invite and the unsubscribe link, and escapes names', () => {
    const email = monthlyEmail({ name: 'Priya <b>R</b>', freeCredits: 5, month: 10, appUrl: 'https://pp.inaivuit.com',
      inviteUrl: 'https://pp.inaivuit.com/?ref=AB12CD34', unsubscribeUrl: 'https://pp.inaivuit.com/api/unsubscribe?u=x&t=y' })
    expect(email.subject).toBe('Your 5 free pictures for November are ready')
    expect(email.text).toContain('Hello Priya,')
    expect(email.text).toContain('?ref=AB12CD34')
    expect(email.text).toContain('Stop these emails: https://pp.inaivuit.com/api/unsubscribe?u=x&t=y')
    expect(email.html).not.toContain('<b>R</b>')
    expect(email.html).toContain('u=x&amp;t=y')
  })

  it('signs unsubscribe links', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    const id = '11111111-2222-4333-8444-555555555555'
    const token = unsubscribeToken(id)
    expect(unsubscribeTokenMatches(id, token)).toBe(true)
    expect(unsubscribeTokenMatches('11111111-2222-4333-8444-555555555556', token)).toBe(false)
    expect(unsubscribeTokenMatches(id, 'x')).toBe(false)
    expect(unsubscribeUrl('https://pp.inaivuit.com', id)).toBe(`https://pp.inaivuit.com/api/unsubscribe?u=${id}&t=${token}`)
  })

  it('accepts From addresses with or without a name', () => {
    expect(FROM_ADDRESS.test('PottuPaarkalaam <hello@inaivuit.com>')).toBe(true)
    expect(FROM_ADDRESS.test('hello@inaivuit.com')).toBe(true)
    expect(FROM_ADDRESS.test('hello')).toBe(false)
  })
})
