import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// A pretend Supabase: the settings row, the auth admin calls and save_phone.
let settings: Record<string, string | null>
const createUser = vi.fn()
const generateLink = vi.fn()
const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: settings, error: null }) }) }) }),
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { admin: { createUser: (...args: unknown[]) => createUser(...args), generateLink: (...args: unknown[]) => generateLink(...args) } },
  },
}))

import { isPhoneLoginEmail, phoneLoginEmail } from '@/lib/rules'
import { phoneLoginConfig, phoneSignIn, verifyMsg91Token } from '@/lib/server/phoneLogin'

const fetchMock = vi.fn()
const msg91Says = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))

beforeEach(() => {
  settings = { msg91_widget_id: 'w-123', msg91_token_auth: 'tok-456', msg91_auth_key: 'auth-789' }
  vi.stubGlobal('fetch', fetchMock)
  rpc.mockResolvedValue({ data: {}, error: null })
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash-abc' } }, error: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  createUser.mockReset()
  generateLink.mockReset()
  rpc.mockReset()
})

describe('stand-in email for mobile sign-in', () => {
  it('is made from the number and recognised, nothing else is', () => {
    expect(phoneLoginEmail('+919876543210')).toBe('pp-phone-919876543210@inaivuit.com')
    expect(isPhoneLoginEmail('pp-phone-919876543210@inaivuit.com')).toBe(true)
    expect(isPhoneLoginEmail('pr@inaivuit.com')).toBe(false)
    expect(isPhoneLoginEmail('pp-phone-919876543210@gmail.com')).toBe(false)
    expect(isPhoneLoginEmail(null)).toBe(false)
  })
})

describe('MSG91 widget token check', () => {
  it('asks MSG91 with the secret auth key and returns the verified number', async () => {
    msg91Says({ type: 'success', message: '919876543210' })
    await expect(verifyMsg91Token('jwt-token', 'auth-789')).resolves.toBe('+919876543210')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://control.msg91.com/api/v5/widget/verifyAccessToken')
    expect(JSON.parse(init.body)).toEqual({ authkey: 'auth-789', 'access-token': 'jwt-token' })
  })

  it('refuses a token MSG91 rejects, or that does not name a mobile number', async () => {
    msg91Says({ type: 'error', message: 'Invalid token' }, 400)
    await expect(verifyMsg91Token('bad', 'auth-789')).rejects.toMatchObject({ status: 401 })
    msg91Says({ type: 'success', message: 'someone@example.com' })
    await expect(verifyMsg91Token('email-token', 'auth-789')).rejects.toMatchObject({ status: 401 })
  })

  it('says so when MSG91 cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(verifyMsg91Token('jwt', 'auth-789')).rejects.toMatchObject({ status: 502 })
  })
})

describe('mobile sign-in', () => {
  it('makes the account on first sign-in, saves the number and returns a sign-in token', async () => {
    msg91Says({ type: 'success', message: '919876543210' })
    createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    await expect(phoneSignIn({ accessToken: 'jwt' })).resolves.toEqual({ tokenHash: 'hash-abc', type: 'magiclink' })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'pp-phone-919876543210@inaivuit.com', phone: '919876543210', email_confirm: true, phone_confirm: true,
    }))
    expect(rpc).toHaveBeenCalledWith('save_phone', { p_user_id: 'user-1', p_phone: '+919876543210', p_offers_ok: false })
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'pp-phone-919876543210@inaivuit.com' })
  })

  it('signs a returning person in without touching their account', async () => {
    msg91Says({ type: 'success', message: '919876543210' })
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } })
    await expect(phoneSignIn({ accessToken: 'jwt' })).resolves.toEqual({ tokenHash: 'hash-abc', type: 'magiclink' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never signs in without a confirmed code, and is off until fully set up', async () => {
    await expect(phoneSignIn({})).rejects.toMatchObject({ status: 400 })
    msg91Says({ type: 'error', message: 'expired' }, 400)
    await expect(phoneSignIn({ accessToken: 'jwt' })).rejects.toMatchObject({ status: 401 })
    expect(createUser).not.toHaveBeenCalled()
    expect(generateLink).not.toHaveBeenCalled()

    settings = { ...settings, msg91_auth_key: null }
    await expect(phoneSignIn({ accessToken: 'jwt' })).rejects.toMatchObject({ status: 503 })
    await expect(phoneLoginConfig()).resolves.toBeNull()
    settings = { ...settings, msg91_auth_key: 'auth-789' }
    await expect(phoneLoginConfig()).resolves.toEqual({ widgetId: 'w-123', tokenAuth: 'tok-456' })
  })
})
