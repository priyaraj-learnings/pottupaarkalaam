import 'server-only'

import { normalizeMobile, phoneLoginEmail } from '@/lib/rules'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ApiError, dbError } from '@/lib/server/http'

// Mobile number sign-in. The browser runs the admin's MSG91 OTP widget, which
// sends the code and checks it, and hands back an access token. Here MSG91
// confirms that token with the secret auth key and tells us the number; the
// person then gets a normal Supabase session for that number.

export type PhoneLoginConfig = { widgetId: string; tokenAuth: string }

const VERIFY_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken'
const FAILED = 'The code could not be confirmed. Please try again.'

export async function msg91Settings() {
  const { data, error } = await supabaseAdmin.from('app_settings')
    .select('msg91_widget_id, msg91_token_auth, msg91_auth_key').eq('id', true).maybeSingle()
  if (error) throw dbError(error, 'Unable to load sign-in settings')
  const row = data as { msg91_widget_id: string | null; msg91_token_auth: string | null; msg91_auth_key: string | null } | null
  return {
    widgetId: row?.msg91_widget_id?.trim() || null,
    tokenAuth: row?.msg91_token_auth?.trim() || null,
    authKey: row?.msg91_auth_key?.trim() || null,
  }
}

// What the sign-in screen needs to show the mobile option (public values), or
// null while it is not set up.
export async function phoneLoginConfig(): Promise<PhoneLoginConfig | null> {
  const { widgetId, tokenAuth, authKey } = await msg91Settings()
  return widgetId && tokenAuth && authKey ? { widgetId, tokenAuth } : null
}

// Every +91 mobile number in a value (strings, and inside objects and lists).
function mobilesIn(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return []
  if (typeof value === 'string' || typeof value === 'number') {
    const phone = normalizeMobile(String(value))
    return phone ? [phone] : []
  }
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(item => mobilesIn(item, depth + 1))
  return []
}

// The claims inside a widget access token (a JWT). Read only after MSG91 has
// confirmed the token is genuine.
function tokenClaims(accessToken: string): unknown {
  try {
    const part = accessToken.split('.')[1]
    return part ? JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) : null
  } catch {
    return null
  }
}

// The +91 number MSG91 verified for this widget access token: from MSG91's
// reply, or else from the token MSG91 has just confirmed.
export async function verifyMsg91Token(accessToken: string, authKey: string) {
  let response: Response
  try {
    response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ authkey: authKey, 'access-token': accessToken }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ApiError(502, 'OTP_UNAVAILABLE', 'Could not reach the SMS service. Please try again.')
  }
  const body = await response.json().catch(() => null) as { type?: string; message?: unknown } | null
  const confirmed = response.ok && body?.type === 'success'
  const phones = confirmed ? [...new Set([...mobilesIn(body), ...mobilesIn(tokenClaims(accessToken))])] : []
  if (phones.length !== 1) {
    // What MSG91 said, without the number: for the admin and the logs.
    const said = typeof body?.message === 'string' ? body.message.replace(/\d{6,}/g, '…').slice(0, 120) : ''
    console.warn(JSON.stringify({ event: 'phone_login.rejected', status: response.status, type: body?.type ?? null, said, keys: body ? Object.keys(body) : [], phones: phones.length }))
    const reason = !confirmed && said ? ` (MSG91: ${said})` : confirmed ? ' (MSG91 confirmed the code but sent no mobile number)' : ''
    throw new ApiError(401, 'OTP_NOT_CONFIRMED', `The code could not be confirmed${reason}. Please try again.`)
  }
  return phones[0]
}

// Confirms the widget's token, makes the account on first sign-in (with the
// number saved as verified, so the app does not ask for it again) and returns a
// one-time sign-in token the browser exchanges for a session.
export async function phoneSignIn(body: unknown) {
  const accessToken = typeof (body as { accessToken?: unknown } | null)?.accessToken === 'string'
    ? ((body as { accessToken: string }).accessToken).trim() : ''
  if (!accessToken || accessToken.length > 4000) throw new ApiError(400, 'INVALID_INPUT', FAILED)

  const { authKey } = await msg91Settings()
  if (!authKey) throw new ApiError(503, 'NOT_CONFIGURED', 'Sign-in with a mobile number is not available yet.')
  const phone = await verifyMsg91Token(accessToken, authKey)
  const email = phoneLoginEmail(phone)

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    phone: phone.slice(1),
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { phone_login: true },
  })
  if (created.error && !/already|exists|registered/i.test(created.error.message)) {
    throw dbError(created.error, 'Unable to create the account')
  }
  const link = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link.data?.properties?.hashed_token
  const userId = link.data?.user?.id ?? created.data.user?.id
  if (link.error || !tokenHash || !userId) throw dbError(link.error, 'Unable to sign in')

  // The account's verified number (also for accounts made before numbers were
  // verified). A number verified on another account stays there.
  const verified = await supabaseAdmin.rpc('verify_phone', { p_user_id: userId, p_phone: phone, p_offers_ok: null })
  if (verified.error) throw dbError(verified.error, 'Unable to save the mobile number')
  if ((verified.data as { error?: string } | null)?.error === 'PHONE_TAKEN') {
    throw new ApiError(409, 'PHONE_TAKEN', 'This mobile number belongs to a PottuPaarkalaam account you made with Google or email. Sign in that way instead.')
  }
  return { tokenHash, type: 'magiclink' as const }
}
