import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const row = { telegram_bot_token: '123456789:AAHabcdefghijklmnopqrstuvwxyz012345', telegram_chat_id: '987654321', telegram_chat_name: 'Priya', telegram_admin_url: 'https://pp.inaivuit.com/admin' }
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) },
}))

import { alertRechargeToCheck, latestChat, rechargeAlertText, TELEGRAM_TOKEN } from '@/lib/server/telegram'

afterEach(() => vi.unstubAllGlobals())

describe('Telegram recharge alerts', () => {
  it('accepts only a BotFather token', () => {
    expect(TELEGRAM_TOKEN.test(row.telegram_bot_token)).toBe(true)
    for (const bad of ['9080404066', 'abc', '123:short', 'https://t.me/mybot']) expect(TELEGRAM_TOKEN.test(bad), bad).toBe(false)
  })

  it('connects the chat that messaged the bot last, a person or a group', () => {
    expect(latestChat([])).toBeNull()
    expect(latestChat([
      { message: { chat: { id: 1, type: 'private', first_name: 'Old' } } },
      { my_chat_member: { chat: { id: -100200, type: 'group', title: 'Payments team' } } },
    ])).toMatchObject({ id: -100200, title: 'Payments team' })
  })

  it('says the amount and the last 4 digits of the UTR, and nothing about the customer', () => {
    const text = rechargeAlertText({ amountInr: 1000, credits: 200, utr: '629912345678' }, 'https://pp.inaivuit.com/admin')
    expect(text).toContain('₹1,000 for 200 credits · UTR ending 5678')
    expect(text).toContain('https://pp.inaivuit.com/admin')
    expect(text).not.toContain('62991234')
  })

  it('sends the alert to the connected chat, and never fails the recharge', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await alertRechargeToCheck({ amountInr: 500, credits: 50, utr: '600000001234' })).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.telegram.org/bot${row.telegram_bot_token}/sendMessage`)
    expect(JSON.parse(String(init.body))).toMatchObject({ chat_id: '987654321' })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), { status: 403 })))
    expect(await alertRechargeToCheck({ amountInr: 500, credits: 50, utr: '600000001234' })).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await alertRechargeToCheck({ amountInr: 500, credits: 50, utr: '600000001234' })).toBe(false)
  })
})
