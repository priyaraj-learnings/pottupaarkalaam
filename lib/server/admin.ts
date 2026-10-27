import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadSettings } from '@/lib/server/account'
import { ApiError, dbError, UUID } from '@/lib/server/http'

// =======================================================
// ADMIN (/admin): recharges to check, bank alerts nobody
// claimed, settings, credits by hand, and the month's
// numbers.
// =======================================================

// Start of this month in India time, as an instant.
export function monthStartIst(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3_600_000)
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

export async function adminOverview() {
  const [settings, stats, pending, recent, alerts] = await Promise.all([
    loadSettings(),
    supabaseAdmin.rpc('admin_stats', { p_since: monthStartIst().toISOString() }),
    supabaseAdmin.from('recharges').select(RECHARGE_COLUMNS).eq('status', 'PENDING').order('created_at', { ascending: true }).limit(100),
    supabaseAdmin.from('recharges').select(RECHARGE_COLUMNS).neq('status', 'PENDING').order('reviewed_at', { ascending: false }).limit(30),
    supabaseAdmin.from('payment_alerts').select('id, utr, amount_inr, sender, message, received_at')
      .is('recharge_id', null).order('received_at', { ascending: false }).limit(30),
  ])
  if (stats.error) throw dbError(stats.error, 'Unable to load numbers')
  if (pending.error) throw dbError(pending.error, 'Unable to load recharges')
  if (recent.error) throw dbError(recent.error, 'Unable to load recharges')
  if (alerts.error) throw dbError(alerts.error, 'Unable to load bank alerts')

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
    stats: stats.data as Record<string, number>,
    pending: pendingRows.map(row => ({ ...row, bank_amount_inr: bankAmount.get(row.utr) ?? null })),
    recent: (recent.data ?? []) as RechargeRow[],
    unmatchedAlerts: alerts.data ?? [],
  }
}

function text(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed.length > max) throw new ApiError(400, 'INVALID_INPUT', `Keep it under ${max} characters.`)
  return trimmed || null
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
  if (upiId && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(upiId)) {
    throw new ApiError(400, 'INVALID_INPUT', 'Enter a UPI ID like inaivuit@okaxis.')
  }
  const minRecharge = whole(input.minRechargeInr, 'Smallest recharge', 1, 1_000_000)
  const row = {
    upi_id: upiId,
    payee_name: text(input.payeeName, 100),
    support_contact: text(input.supportContact, 200),
    free_credits_per_month: whole(input.freeCreditsPerMonth, 'Free credits', 0, 100),
    standard_rate_inr: whole(input.standardRateInr, 'Standard price', 1, 1000),
    bulk_rate_inr: whole(input.bulkRateInr, 'Bulk price', 1, 1000),
    bulk_min_recharge_inr: whole(input.bulkMinRechargeInr, 'Bulk price from', 1, 1_000_000),
    min_recharge_inr: minRecharge,
    max_recharge_inr: whole(input.maxRechargeInr, 'Largest recharge', minRecharge, 1_000_000),
    updated_at: new Date().toISOString(),
    updated_by: adminId,
  }
  const { error } = await supabaseAdmin.from('app_settings').update(row).eq('id', true)
  if (error) throw dbError(error, 'Unable to save settings')
  return loadSettings()
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
