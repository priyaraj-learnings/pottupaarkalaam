import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { ApiError, dbError } from '@/lib/server/http'

// =======================================================
// EMAIL (Resend, resend.com)
//
// The admin saves a Resend API key and the "From" address
// (on a domain verified in Resend) in /admin Settings → Email.
// The key is write-only: it never goes back to the browser.
//
// One email so far: on the 1st of each month (India time,
// from 10 am), "your free pictures are back", to customers who
// did not use all of last month's (take_monthly_email_batch in
// the database decides who, and marks them sent). It is
// account news about their free credits, at most 95 a day (Resend's
// free plan sends 100 a day; the rest go out on the next days), with a one-click
// unsubscribe link in every email (List-Unsubscribe too).
// =======================================================

const API = 'https://api.resend.com/emails'
const DEFAULT_APP_URL = 'https://pp.inaivuit.com'
// Monthly emails a day (India time). Resend's free plan sends 100 a day; this
// leaves room for test emails.
export const DAILY_LIMIT = 95
// "Name <hello@example.com>" or a bare address.
export const FROM_ADDRESS = /^([^<>@\n]{1,80}<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)$/

type Row = {
  resend_api_key: string | null
  email_from: string | null
  monthly_email_enabled: boolean
  app_url: string | null
  free_credits_per_month: number
}

async function settings(): Promise<Row> {
  const { data, error } = await supabaseAdmin.from('app_settings')
    .select('resend_api_key, email_from, monthly_email_enabled, app_url, free_credits_per_month').eq('id', true).maybeSingle()
  if (error) throw dbError(error, 'Unable to load email settings')
  return (data ?? { resend_api_key: null, email_from: null, monthly_email_enabled: false, app_url: null, free_credits_per_month: 0 }) as Row
}

// What /admin Settings shows (never the key).
export async function emailStatus() {
  const row = await settings().catch(() => null)
  const { count } = await supabaseAdmin.from('accounts').select('user_id', { count: 'exact', head: true })
    .eq('monthly_email_sent_month', firstOfMonthIndia(new Date()))
  return {
    keySet: Boolean(row?.resend_api_key),
    from: row?.email_from ?? '',
    monthlyEnabled: Boolean(row?.monthly_email_enabled),
    // Customers this month's email went to (or was tried for).
    sentThisMonth: count ?? 0,
  }
}

const appUrl = (row: Row) => (row.app_url ?? DEFAULT_APP_URL).replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// Unsubscribe links: signed with CRON_SECRET, so only links we sent work.
// ---------------------------------------------------------------------------

function signingKey() {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) throw new ApiError(503, 'NOT_CONFIGURED', 'CRON_SECRET is not set.')
  return secret
}

export function unsubscribeToken(userId: string) {
  return createHmac('sha256', `pp-unsubscribe:${signingKey()}`).update(userId, 'utf8').digest('base64url').slice(0, 32)
}

export function unsubscribeTokenMatches(userId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(userId))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export function unsubscribeUrl(base: string, userId: string) {
  return `${base}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`
}

// ---------------------------------------------------------------------------
// The monthly email
// ---------------------------------------------------------------------------

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string
))

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// The 1st of this month in India, as yyyy-mm-01.
export function firstOfMonthIndia(now: Date) {
  const india = new Date(now.getTime() + 330 * 60_000)
  return `${india.getUTCFullYear()}-${String(india.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// Sending starts on the 1st from 10 am India time (and carries on in later
// hourly runs, also on later days, for anyone not reached yet).
export function monthlySendingOpen(now: Date) {
  const india = new Date(now.getTime() + 330 * 60_000)
  return india.getUTCDate() > 1 || india.getUTCHours() >= 10
}

export type MonthlyEmail = { subject: string; html: string; text: string }

export function monthlyEmail(input: { name: string | null; freeCredits: number; month: number; appUrl: string; inviteUrl: string | null; unsubscribeUrl: string }): MonthlyEmail {
  const month = MONTHS[input.month] ?? 'this month'
  const pictures = `${input.freeCredits} free picture${input.freeCredits === 1 ? '' : 's'}`
  const hello = input.name ? `Hello ${input.name.split(/\s+/)[0]},` : 'Hello,'
  const subject = `Your ${pictures} for ${month} are ready`
  const lines = [
    `Your ${pictures} for ${month} are waiting in PottuPaarkalaam. See how a saree, blouse, dhoti or lehenga looks on you before you buy or stitch it.`,
    'Tip: try the same fabric with two or three blouse styles side by side, or add a family photo for the occasion.',
  ]
  const invite = input.inviteUrl
    ? `Invite a friend with your link and you both get 2 more free pictures when they join: ${input.inviteUrl}`
    : null
  const text = [
    hello, '', ...lines, '', `Try one now: ${input.appUrl}`, ...(invite ? ['', invite] : []), '',
    'Free pictures are for this month only and do not carry over.', '',
    'PottuPaarkalaam by inaivu IT',
    `You get this email once a month because you have a PottuPaarkalaam account. Stop these emails: ${input.unsubscribeUrl}`,
  ].join('\n')
  const button = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;background:#9f1239;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:12px">${escapeHtml(label)}</a>`
  const html = `<!doctype html><html><body style="margin:0;background:#fdf6f0;font-family:Arial,Helvetica,sans-serif;color:#292524">
<div style="max-width:520px;margin:0 auto;padding:24px 18px">
<p style="font-size:20px;font-weight:bold;color:#9f1239;margin:0 0 16px">PottuPaarkalaam</p>
<p style="font-size:16px;margin:0 0 12px">${escapeHtml(hello)}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px">Your <b>${escapeHtml(pictures)}</b> for ${escapeHtml(month)} are waiting. See how a saree, blouse, dhoti or lehenga looks on you before you buy or stitch it.</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px;color:#57534e">${escapeHtml(lines[1])}</p>
<p style="margin:0 0 24px">${button(input.appUrl, 'Try one now')}</p>
${invite ? `<p style="font-size:15px;line-height:1.5;margin:0 0 24px;padding:12px;background:#ffffff;border-radius:12px">🎁 Invite a friend with your link and you both get <b>2 more free pictures</b> when they join:<br><a href="${escapeHtml(input.inviteUrl as string)}" style="color:#9f1239">${escapeHtml(input.inviteUrl as string)}</a></p>` : ''}
<p style="font-size:13px;color:#78716c;margin:0 0 8px">Free pictures are for this month only and do not carry over.</p>
<p style="font-size:12px;color:#a8a29e;line-height:1.5;margin:16px 0 0">PottuPaarkalaam by inaivu IT. You get this email once a month because you have a PottuPaarkalaam account.
<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#78716c">Stop these emails</a>.</p>
</div></body></html>`
  return { subject, html, text }
}

async function send(row: Row, message: { to: string; subject: string; html: string; text: string; unsubscribe?: string }) {
  if (!row.resend_api_key || !row.email_from) throw new ApiError(400, 'NOT_CONFIGURED', 'Save the Resend API key and the From address first.')
  let response: Response
  try {
    response = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${row.resend_api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: row.email_from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.unsubscribe
          ? { 'List-Unsubscribe': `<${message.unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
          : undefined,
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ApiError(502, 'EMAIL_UNAVAILABLE', 'Could not reach Resend. Please try again.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: unknown } | null
    const said = typeof body?.message === 'string' ? body.message.slice(0, 200) : `HTTP ${response.status}`
    throw new ApiError(400, 'EMAIL_FAILED', `Resend said: ${said}`)
  }
}

type Recipient = { user_id: string; email: string; name: string | null; free_credits: number; referral_code: string | null }

const inviteUrl = (base: string, code: string | null) => (code ? `${base}/?ref=${code}` : null)

// From the hourly cleanup. Never throws: the cleanup carries on regardless.
export async function sendMonthlyEmails(now = new Date(), limit = 100) {
  try {
    if (!monthlySendingOpen(now)) return { sent: 0, failed: 0 }
    const row = await settings()
    if (!row.monthly_email_enabled || !row.resend_api_key || !row.email_from) return { sent: 0, failed: 0 }
    const { data, error } = await supabaseAdmin.rpc('take_monthly_email_batch', { p_limit: limit, p_daily_limit: DAILY_LIMIT })
    if (error) throw dbError(error, 'Unable to pick the monthly email list')
    const base = appUrl(row)
    const month = Number(firstOfMonthIndia(now).slice(5, 7)) - 1
    let sent = 0
    let failed = 0
    for (const person of (data ?? []) as Recipient[]) {
      const unsubscribe = unsubscribeUrl(base, person.user_id)
      const email = monthlyEmail({ name: person.name, freeCredits: person.free_credits, month, appUrl: base, inviteUrl: inviteUrl(base, person.referral_code), unsubscribeUrl: unsubscribe })
      try {
        await send(row, { to: person.email, ...email, unsubscribe })
        sent += 1
      } catch (sendError) {
        failed += 1
        console.error(JSON.stringify({ event: 'email.monthly_failed', message: sendError instanceof Error ? sendError.message : String(sendError) }))
      }
    }
    return { sent, failed }
  } catch (error) {
    console.error(JSON.stringify({ event: 'email.monthly_batch_failed', message: error instanceof Error ? error.message : String(error) }))
    return { sent: 0, failed: 0 }
  }
}

// /admin Settings → Email: save, or send the admin a test of the monthly email.
export async function emailAction(admin: { id: string; email: string | null; name: string | null }, body: unknown) {
  const input = (body ?? {}) as { action?: unknown; apiKey?: unknown; from?: unknown; monthlyEnabled?: unknown; appUrl?: unknown }
  if (input.action === 'save') {
    const update: Record<string, unknown> = { monthly_email_enabled: input.monthlyEnabled === true }
    const from = typeof input.from === 'string' ? input.from.trim() : ''
    if (from && !FROM_ADDRESS.test(from)) throw new ApiError(400, 'INVALID_INPUT', 'Enter the From address like: PottuPaarkalaam <hello@inaivuit.com>')
    update.email_from = from || null
    // Write-only: an empty box keeps the saved key.
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
    if (apiKey) {
      if (!/^re_[A-Za-z0-9_-]{10,120}$/.test(apiKey)) throw new ApiError(400, 'INVALID_INPUT', 'That is not a Resend API key (it starts with re_).')
      update.resend_api_key = apiKey
    }
    if (typeof input.appUrl === 'string' && /^https:\/\/[^\s/]{3,100}$/.test(input.appUrl)) update.app_url = input.appUrl
    if (update.monthly_email_enabled && !(apiKey || (await settings()).resend_api_key)) {
      throw new ApiError(400, 'NOT_CONFIGURED', 'Add the Resend API key before turning the monthly email on.')
    }
    if (update.monthly_email_enabled && !from) throw new ApiError(400, 'NOT_CONFIGURED', 'Add the From address before turning the monthly email on.')
    const { error } = await supabaseAdmin.from('app_settings').update(update).eq('id', true)
    if (error) throw dbError(error, 'Unable to save email settings')
    return emailStatus()
  }
  if (input.action === 'test') {
    if (!admin.email) throw new ApiError(400, 'NO_EMAIL', 'Your admin account has no email address to send the test to.')
    const row = await settings()
    const base = appUrl(row)
    const { data: account } = await supabaseAdmin.from('accounts').select('referral_code').eq('user_id', admin.id).maybeSingle()
    const unsubscribe = unsubscribeUrl(base, admin.id)
    const email = monthlyEmail({
      name: admin.name, freeCredits: row.free_credits_per_month || 5, month: Number(firstOfMonthIndia(new Date()).slice(5, 7)) - 1,
      appUrl: base, inviteUrl: inviteUrl(base, (account as { referral_code?: string } | null)?.referral_code ?? null), unsubscribeUrl: unsubscribe,
    })
    await send(row, { to: admin.email, ...email, subject: `[Test] ${email.subject}`, unsubscribe })
    return emailStatus()
  }
  throw new ApiError(400, 'INVALID_INPUT', 'Unknown action.')
}
