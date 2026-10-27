import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: (...args: unknown[]) => rpc(...args) } }))

import { monthStartIst } from '@/lib/server/admin'
import { ApiError, secretMatches } from '@/lib/server/http'
import { receivePaymentAlert } from '@/lib/server/paymentAlerts'

const SMS = 'Rs.200.00 credited to HDFC Bank A/c XX1234 from VPA a@ybl (UPI 629912345678)'

function post(body: string, headers: Record<string, string>) {
  return new Request('https://pp.inaivuit.com/api/payments/notify', { method: 'POST', body, headers })
}

describe('payment alert webhook', () => {
  beforeEach(() => {
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', 's3cret-value')
    vi.stubEnv('PAYMENT_SMS_SENDERS', 'HDFCBK')
    rpc.mockResolvedValue({ data: { outcome: 'MATCHED' }, error: null })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    rpc.mockReset()
  })

  it('refuses requests without the secret', async () => {
    await expect(receivePaymentAlert(post(JSON.stringify({ text: SMS }), { 'content-type': 'application/json' })))
      .rejects.toMatchObject({ status: 401 })
    await expect(receivePaymentAlert(post(SMS, { authorization: 'Bearer wrong' }))).rejects.toBeInstanceOf(ApiError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('records a bank credit from an allowed sender', async () => {
    const result = await receivePaymentAlert(post(JSON.stringify({ from: 'VM-HDFCBK-S', text: SMS }), {
      authorization: 'Bearer s3cret-value', 'content-type': 'application/json',
    }))
    expect(result).toEqual({ outcome: 'MATCHED' })
    expect(rpc).toHaveBeenCalledWith('record_payment_alert', expect.objectContaining({ p_utr: '629912345678', p_amount_inr: 200 }))
  })

  it('accepts form posts and the X-Webhook-Secret header', async () => {
    const form = new URLSearchParams({ sender: 'AD-HDFCBK', message: SMS }).toString()
    await receivePaymentAlert(post(form, { 'x-webhook-secret': 's3cret-value', 'content-type': 'application/x-www-form-urlencoded' }))
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('ignores other senders and messages that are not credits', async () => {
    const auth = { authorization: 'Bearer s3cret-value', 'content-type': 'application/json' }
    expect(await receivePaymentAlert(post(JSON.stringify({ from: '+919876543210', text: SMS }), auth)))
      .toEqual({ outcome: 'IGNORED', reason: 'SENDER_NOT_ALLOWED' })
    expect(await receivePaymentAlert(post(JSON.stringify({ from: 'HDFCBK', text: 'Your OTP is 123456' }), auth)))
      .toEqual({ outcome: 'IGNORED', reason: 'NOT_A_UPI_CREDIT' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('helpers', () => {
  it('compares secrets exactly', () => {
    expect(secretMatches('abc', 'abc')).toBe(true)
    expect(secretMatches('abd', 'abc')).toBe(false)
    expect(secretMatches('ab', 'abc')).toBe(false)
    expect(secretMatches(null, 'abc')).toBe(false)
    expect(secretMatches('abc', undefined)).toBe(false)
  })

  it('starts the month at midnight India time', () => {
    expect(monthStartIst(new Date('2026-10-26T10:00:00Z')).toISOString()).toBe('2026-09-30T18:30:00.000Z')
    // 1 Nov 00:10 in India is still 31 Oct in UTC.
    expect(monthStartIst(new Date('2026-10-31T18:40:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z')
  })
})
