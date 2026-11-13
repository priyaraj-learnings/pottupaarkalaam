import 'server-only'

import { parseBankCredit, senderAllowed } from '@/lib/bankAlert'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ApiError, bearerToken, dbError, secretMatches } from '@/lib/server/http'

// =======================================================
// BANK ALERT WEBHOOK (automatic recharge verification)
//
// An SMS-forwarding app on the Android phone that receives
// the bank's credit SMS posts each message here with the
// shared secret (PAYMENT_WEBHOOK_SECRET). A credit with a
// UTR and amount is stored; a pending recharge with the
// same UTR and amount is approved at once (SQL
// record_payment_alert). Accepted shapes:
//   JSON {"from": "...", "text": "..."} (also "message",
//   "body", "sms"), form fields with those names, or the
//   message as plain text.
// =======================================================

const TEXT_KEYS = ['text', 'message', 'body', 'sms', 'msg', 'content']
const SENDER_KEYS = ['from', 'sender', 'address', 'phone', 'number']

function pick(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

async function readMessage(request: Request) {
  const type = request.headers.get('content-type') ?? ''
  const raw = (await request.text()).slice(0, 20_000)
  if (type.includes('application/json')) {
    try {
      const record = JSON.parse(raw) as Record<string, unknown>
      // Set by the Gmail script when the email passed the bank's DMARC check.
      return { text: pick(record, TEXT_KEYS), sender: pick(record, SENDER_KEYS), authenticated: record.authenticated === true }
    } catch {
      throw new ApiError(400, 'INVALID_INPUT', 'Invalid JSON.')
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    const record = Object.fromEntries(new URLSearchParams(raw))
    return { text: pick(record, TEXT_KEYS), sender: pick(record, SENDER_KEYS), authenticated: false }
  }
  return { text: raw.trim() || null, sender: request.headers.get('x-sender'), authenticated: false }
}

// The bank senders trusted to approve recharges: /admin Settings, else the
// PAYMENT_SMS_SENDERS environment variable. Empty: nobody.
export async function trustedSenders() {
  const { data } = await supabaseAdmin.from('app_settings').select('payment_senders').eq('id', true).maybeSingle()
  const saved = (data as { payment_senders?: string | null } | null)?.payment_senders?.trim()
  return saved || process.env.PAYMENT_SMS_SENDERS?.trim() || ''
}

export async function receivePaymentAlert(request: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim()
  if (!secret) throw new ApiError(503, 'NOT_CONFIGURED', 'Automatic verification is not set up.')
  const supplied = bearerToken(request) ?? request.headers.get('x-webhook-secret')
  if (!secretMatches(supplied, secret)) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized.')

  const { text, sender, authenticated } = await readMessage(request)
  if (!text) return { outcome: 'IGNORED', reason: 'NO_TEXT' }
  const trusted = await trustedSenders()
  if (!trusted) {
    console.warn(JSON.stringify({ event: 'payment_alert.no_trusted_senders' }))
    return { outcome: 'IGNORED', reason: 'NO_TRUSTED_SENDERS' }
  }
  if (!senderAllowed(sender, trusted, authenticated)) return { outcome: 'IGNORED', reason: 'SENDER_NOT_ALLOWED' }
  const credit = parseBankCredit(text)
  if (!credit) return { outcome: 'IGNORED', reason: 'NOT_A_UPI_CREDIT' }

  const { data, error } = await supabaseAdmin.rpc('record_payment_alert', {
    p_utr: credit.utr,
    p_amount_inr: credit.amountInr,
    p_sender: sender,
    p_message: text.slice(0, 1000),
  })
  if (error) throw dbError(error, 'Unable to record the payment alert')
  console.info(JSON.stringify({ event: 'payment_alert.received', outcome: (data as { outcome?: string })?.outcome }))
  return data as { outcome: string; rechargeId?: string }
}
