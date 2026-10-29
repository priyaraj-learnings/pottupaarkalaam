import 'server-only'

import { DEFAULT_COUPLE_CREDITS } from '@/lib/rules'
import { parseUpiQr } from '@/lib/upi'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadSettings } from '@/lib/server/account'
import { ApiError, dbError, UUID } from '@/lib/server/http'

// =======================================================
// ADMIN (/admin): the numbers (money received, AI cost,
// earnings), customers, recharges to check, bank alerts
// nobody claimed, settings and credits by hand.
// =======================================================

const IST_OFFSET_MS = 5.5 * 3_600_000

// Start of this month in India time, as an instant.
export function monthStartIst(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS)
}

export const PERIODS = ['this-month', 'last-month', 'last-7-days', 'last-30-days', 'all'] as const
export type Period = typeof PERIODS[number]

export function isPeriod(value: unknown): value is Period {
  return PERIODS.includes(value as Period)
}

// [from, to) for a report period. Current periods end a minute from now, so
// what happened a moment ago is included.
export function periodRange(period: Period, now = new Date(), firstActivity: Date | null = null) {
  const soon = new Date(now.getTime() + 60_000)
  const thisMonth = monthStartIst(now)
  switch (period) {
    case 'last-month':
      return { from: monthStartIst(new Date(thisMonth.getTime() - 1)), to: thisMonth }
    case 'last-7-days':
      return { from: new Date(now.getTime() - 7 * 86_400_000), to: soon }
    case 'last-30-days':
      return { from: new Date(now.getTime() - 30 * 86_400_000), to: soon }
    case 'all':
      return { from: monthStartIst(firstActivity ?? now), to: soon }
    default:
      return { from: thisMonth, to: soon }
  }
}

type RechargeRow = {
  id: string
  user_id: string | null
  user_email: string | null
  amount_inr: number
  credits: number
  utr: string
  status: string
  auto_verified: boolean
  created_at: string
  reviewed_at: string | null
  rejection_reason: string | null
}

const RECHARGE_COLUMNS = 'id, user_id, user_email, amount_inr, credits, utr, status, auto_verified, created_at, reviewed_at, rejection_reason'

export type AiRates = {
  usdToInr: number
  textInputUsdPerMillion: number
  imageInputUsdPerMillion: number
  outputUsdPerMillion: number
}

async function loadAiRates(): Promise<AiRates> {
  const { data, error } = await supabaseAdmin.from('app_settings')
    .select('usd_to_inr, ai_text_input_usd_per_million, ai_image_input_usd_per_million, ai_output_usd_per_million')
    .eq('id', true).single()
  if (error || !data) throw dbError(error, 'Unable to load AI rates')
  return {
    usdToInr: Number(data.usd_to_inr),
    textInputUsdPerMillion: Number(data.ai_text_input_usd_per_million),
    imageInputUsdPerMillion: Number(data.ai_image_input_usd_per_million),
    outputUsdPerMillion: Number(data.ai_output_usd_per_million),
  }
}

// Settings, recharges to check and bank credits nobody claimed.
export async function adminOverview() {
  const [settings, aiRates, pending, recent, alerts, lastAlert, msg91] = await Promise.all([
    loadSettings(),
    loadAiRates(),
    supabaseAdmin.from('recharges').select(RECHARGE_COLUMNS).eq('status', 'PENDING').order('created_at', { ascending: true }).limit(100),
    supabaseAdmin.from('recharges').select(RECHARGE_COLUMNS).neq('status', 'PENDING').order('reviewed_at', { ascending: false }).limit(30),
    supabaseAdmin.from('payment_alerts').select('id, utr, amount_inr, sender, message, received_at')
      .is('recharge_id', null).order('received_at', { ascending: false }).limit(30),
    supabaseAdmin.from('payment_alerts').select('received_at').order('received_at', { ascending: false }).limit(1),
    supabaseAdmin.from('app_settings').select('msg91_widget_id, msg91_token_auth, msg91_auth_key, free_needs_mobile').eq('id', true).maybeSingle(),
  ])
  if (pending.error) throw dbError(pending.error, 'Unable to load recharges')
  if (recent.error) throw dbError(recent.error, 'Unable to load recharges')
  if (alerts.error) throw dbError(alerts.error, 'Unable to load bank alerts')
  if (lastAlert.error) throw dbError(lastAlert.error, 'Unable to load bank alerts')
  if (msg91.error) throw dbError(msg91.error, 'Unable to load sign-in settings')
  const msg91Row = msg91.data as { msg91_widget_id: string | null; msg91_token_auth: string | null; msg91_auth_key: string | null; free_needs_mobile: boolean } | null

  // What the bank said for each waiting UTR, if its alert has arrived.
  const pendingRows = (pending.data ?? []) as RechargeRow[]
  const utrs = pendingRows.map(row => row.utr)
  const { data: bank, error: bankError } = utrs.length
    ? await supabaseAdmin.from('payment_alerts').select('utr, amount_inr').in('utr', utrs)
    : { data: [] as Array<{ utr: string; amount_inr: number }>, error: null }
  if (bankError) throw dbError(bankError, 'Unable to load bank alerts')
  const bankAmount = new Map((bank ?? []).map(row => [row.utr, Number(row.amount_inr)]))

  return {
    settings,
    aiRates,
    pending: pendingRows.map(row => ({ ...row, bank_amount_inr: bankAmount.get(row.utr) ?? null })),
    recent: (recent.data ?? []) as RechargeRow[],
    unmatchedAlerts: alerts.data ?? [],
    // Whether bank credit SMS are reaching the app (docs/SETUP.md §6.3).
    paymentSms: {
      secretSet: Boolean(process.env.PAYMENT_WEBHOOK_SECRET?.trim()),
      senders: (process.env.PAYMENT_SMS_SENDERS ?? '').split(',').map(sender => sender.trim()).filter(Boolean),
      lastAlertAt: (lastAlert.data?.[0]?.received_at as string | undefined) ?? null,
    },
    // Mobile number sign-in (MSG91 OTP widget). The auth key is never sent back.
    phoneLogin: {
      widgetId: msg91Row?.msg91_widget_id ?? '',
      tokenAuth: msg91Row?.msg91_token_auth ?? '',
      authKeySet: Boolean(msg91Row?.msg91_auth_key),
      freeNeedsMobile: Boolean(msg91Row?.free_needs_mobile),
    },
  }
}

function text(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed.length > max) throw new ApiError(400, 'INVALID_INPUT', `Keep it under ${max} characters.`)
  return trimmed || null
}

function decimal(value: unknown, label: string, min: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiError(400, 'INVALID_INPUT', `${label} must be a number from ${min} to ${max.toLocaleString('en-IN')}.`)
  }
  return Math.round(number * 10_000) / 10_000
}

function whole(value: unknown, label: string, min: number, max: number) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ApiError(400, 'INVALID_INPUT', `${label} must be a whole number from ${min} to ${max.toLocaleString('en-IN')}.`)
  }
  return number
}

export async function updateSettings(adminId: string, body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>
  const upiId = text(input.upiId, 256)
  if (upiId && !/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,64}$/.test(upiId)) {
    throw new ApiError(400, 'INVALID_INPUT', 'Enter a UPI ID like inaivuit@okaxis.')
  }
  // The business's QR text must be a UPI QR for this same UPI ID.
  const upiQrText = text(input.upiQrText, 600)
  if (upiQrText) {
    const qr = parseUpiQr(upiQrText)
    if (!qr) throw new ApiError(400, 'INVALID_INPUT', 'The QR text must start with upi://pay?pa= (the text inside your UPI QR).')
    if (!upiId || qr.pa.toLowerCase() !== upiId.toLowerCase()) {
      throw new ApiError(400, 'INVALID_INPUT', `That QR is for ${qr.pa}, but the UPI ID above is ${upiId ?? 'empty'}. Use the same UPI ID.`)
    }
  }
  const minRecharge = whole(input.minRechargeInr, 'Smallest recharge', 1, 1_000_000)
  const row = {
    upi_id: upiId,
    upi_qr_text: upiQrText,
    payee_name: text(input.payeeName, 100),
    support_contact: text(input.supportContact, 200),
    free_credits_per_month: whole(input.freeCreditsPerMonth, 'Free credits', 0, 100),
    standard_rate_inr: whole(input.standardRateInr, 'Standard price', 1, 1000),
    bulk_rate_inr: whole(input.bulkRateInr, 'Bulk price', 1, 1000),
    bulk_min_recharge_inr: whole(input.bulkMinRechargeInr, 'Bulk price from', 1, 1_000_000),
    min_recharge_inr: minRecharge,
    max_recharge_inr: whole(input.maxRechargeInr, 'Largest recharge', minRecharge, 1_000_000),
    usd_to_inr: decimal(input.usdToInr, 'Rupees per US dollar', 1, 1000),
    ai_text_input_usd_per_million: decimal(input.textInputUsdPerMillion, 'Text input price', 0, 10_000),
    ai_image_input_usd_per_million: decimal(input.imageInputUsdPerMillion, 'Image input price', 0, 10_000),
    ai_output_usd_per_million: decimal(input.outputUsdPerMillion, 'Image output price', 0, 10_000),
    msg91_widget_id: text(input.msg91WidgetId, 100),
    msg91_token_auth: text(input.msg91TokenAuth, 300),
    updated_at: new Date().toISOString(),
    updated_by: adminId,
  } as Record<string, unknown>
  // Recharges buy whole credits, so these amounts must divide by their price.
  const standardRate = row.standard_rate_inr as number
  const bulkRate = row.bulk_rate_inr as number
  const bulkMin = row.bulk_min_recharge_inr as number
  if (minRecharge % standardRate !== 0) {
    throw new ApiError(400, 'INVALID_INPUT', `The smallest recharge must buy whole credits: use a multiple of ₹${standardRate}, e.g. ₹${Math.ceil(minRecharge / standardRate) * standardRate}.`)
  }
  if (bulkMin % bulkRate !== 0) {
    throw new ApiError(400, 'INVALID_INPUT', `"Bulk price from" must buy whole credits: use a multiple of ₹${bulkRate}.`)
  }
  // Write-only: an empty box keeps the saved key.
  const authKey = text(input.msg91AuthKey, 300)
  if (authKey) row.msg91_auth_key = authKey
  // Free credits only for a verified mobile number: needs the MSG91 widget,
  // or nobody could verify a number and nobody would get free credits.
  const freeNeedsMobile = input.freeNeedsMobile === true || input.freeNeedsMobile === 'true'
  if (freeNeedsMobile) {
    const { data: saved, error: savedError } = await supabaseAdmin.from('app_settings').select('msg91_auth_key').eq('id', true).maybeSingle()
    if (savedError) throw dbError(savedError, 'Unable to load sign-in settings')
    if (!row.msg91_widget_id || !row.msg91_token_auth || !(authKey || (saved as { msg91_auth_key: string | null } | null)?.msg91_auth_key)) {
      throw new ApiError(400, 'INVALID_INPUT', 'Set up mobile number sign-in (MSG91) first: free credits for verified numbers need it.')
    }
  }
  row.free_needs_mobile = freeNeedsMobile
  row.couple_enabled = input.coupleEnabled === true || input.coupleEnabled === 'true'
  row.couple_credits = whole(input.coupleCredits ?? DEFAULT_COUPLE_CREDITS, 'Credits per couple picture', 1, 50)
  const { error } = await supabaseAdmin.from('app_settings').update(row).eq('id', true)
  if (error) throw dbError(error, 'Unable to save settings')
  return { settings: await loadSettings(), aiRates: await loadAiRates() }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function adminAnalytics(period: Period) {
  let firstActivity: Date | null = null
  if (period === 'all') {
    const { data, error } = await supabaseAdmin.from('accounts').select('created_at').order('created_at', { ascending: true }).limit(1)
    if (error) throw dbError(error, 'Unable to load the first sign-in')
    firstActivity = data?.[0] ? new Date(data[0].created_at as string) : null
  }
  const { from, to } = periodRange(period, new Date(), firstActivity)
  const { data, error } = await supabaseAdmin.rpc('admin_analytics', { p_from: from.toISOString(), p_to: to.toISOString() })
  if (error) throw dbError(error, 'Unable to load the numbers')
  return { period, from: from.toISOString(), to: to.toISOString(), ...(data as Record<string, unknown>) }
}

const SORTS = new Set(['recent', 'active', 'paid', 'pictures'])
const PAGE_SIZE = 50

export async function adminCustomers(params: URLSearchParams) {
  const sort = SORTS.has(params.get('sort') ?? '') ? params.get('sort') : 'recent'
  const page = Math.max(0, Math.min(1000, Number.parseInt(params.get('page') ?? '0', 10) || 0))
  // The CSV export reads 200 at a time.
  const pageSize = Math.max(1, Math.min(200, Number.parseInt(params.get('size') ?? '', 10) || PAGE_SIZE))
  const { data, error } = await supabaseAdmin.rpc('admin_users', {
    p_search: text(params.get('search'), 100),
    p_sort: sort,
    p_limit: pageSize,
    p_offset: page * pageSize,
  })
  if (error) throw dbError(error, 'Unable to load customers')
  return { ...(data as Record<string, unknown>), page, pageSize }
}

export async function adminCustomer(userId: string) {
  if (!UUID.test(userId)) throw new ApiError(404, 'NOT_FOUND', 'Customer not found.')
  const { data, error } = await supabaseAdmin.rpc('admin_user_detail', { p_user_id: userId })
  if (error) throw dbError(error, 'Unable to load the customer')
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Customer not found.')
  return data as Record<string, unknown>
}

const STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED'])

// Every recharge in a period (newest first, up to 1,000), for the payments
// list and its CSV export.
export async function adminPayments(params: URLSearchParams) {
  const period = isPeriod(params.get('period')) ? params.get('period') as Period : 'this-month'
  const { from, to } = periodRange(period, new Date(), period === 'all' ? new Date('2026-01-01T00:00:00+05:30') : null)
  let query = supabaseAdmin.from('recharges')
    .select('id, user_id, user_email, amount_inr, credits, rate_inr, utr, status, auto_verified, created_at, reviewed_at, rejection_reason')
    .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
    .order('created_at', { ascending: false }).limit(1000)
  const status = params.get('status')
  if (status && STATUSES.has(status)) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw dbError(error, 'Unable to load payments')
  return { period, payments: data ?? [] }
}

export async function reviewRecharge(adminId: string, rechargeId: string, body: unknown) {
  if (!UUID.test(rechargeId)) throw new ApiError(404, 'NOT_FOUND', 'Recharge not found.')
  const input = (body ?? {}) as { decision?: unknown; reason?: unknown }
  const decision = input.decision === 'APPROVE' || input.decision === 'REJECT' ? input.decision : null
  if (!decision) throw new ApiError(400, 'INVALID_INPUT', 'Choose approve or reject.')
  const { data, error } = await supabaseAdmin.rpc('review_recharge', {
    p_recharge_id: rechargeId,
    p_admin_id: adminId,
    p_decision: decision,
    p_reason: text(input.reason, 200),
  })
  if (error) throw dbError(error, 'Unable to review the recharge')
  const result = data as { error?: string; status?: string }
  if (result.error === 'NOT_FOUND') throw new ApiError(404, 'NOT_FOUND', 'Recharge not found.')
  if (result.error === 'ALREADY_REVIEWED') throw new ApiError(409, 'ALREADY_REVIEWED', `This recharge is already ${result.status?.toLowerCase()}.`)
  if (result.error === 'USER_DELETED') throw new ApiError(409, 'USER_DELETED', 'This person has deleted their account.')
  return result
}

export async function adjustCredits(adminId: string, body: unknown) {
  const input = (body ?? {}) as { email?: unknown; credits?: unknown; reason?: unknown }
  const email = text(input.email, 320)
  const credits = Number(input.credits)
  const reason = text(input.reason, 200)
  if (!email) throw new ApiError(400, 'INVALID_INPUT', 'Enter the person\'s email.')
  if (!Number.isInteger(credits) || credits === 0 || Math.abs(credits) > 100_000) {
    throw new ApiError(400, 'INVALID_INPUT', 'Enter the credits to add (or a minus number to take back).')
  }
  if (!reason || reason.length < 3) throw new ApiError(400, 'INVALID_INPUT', 'Enter a reason.')
  const { data, error } = await supabaseAdmin.rpc('adjust_credits', {
    p_email: email, p_admin_id: adminId, p_credits: credits, p_reason: reason,
  })
  if (error) throw dbError(error, 'Unable to change credits')
  const result = data as { error?: string; credits?: number }
  if (result.error === 'USER_NOT_FOUND') throw new ApiError(404, 'USER_NOT_FOUND', 'Nobody has signed in with that email.')
  if (result.error === 'NOT_ENOUGH_CREDITS') throw new ApiError(400, 'NOT_ENOUGH_CREDITS', `They have only ${result.credits} paid credits.`)
  return result
}
