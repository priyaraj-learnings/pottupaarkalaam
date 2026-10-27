import 'server-only'

import { DEFAULT_PRICING, normalizeUtr, TERMS_VERSION, type Pricing } from '@/lib/rules'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { SignedInUser } from '@/lib/server/auth'
import { ApiError, dbError } from '@/lib/server/http'

export type Account = {
  credits: number
  freeCreditsPerMonth: number
  freeLeft: number
  termsVersion: string | null
  termsAcceptedAt: string | null
}

export type AppSettings = {
  upiId: string | null
  payeeName: string | null
  supportContact: string | null
  pricing: Pricing
}

type SettingsRow = {
  upi_id: string | null
  payee_name: string | null
  support_contact: string | null
  free_credits_per_month: number
  standard_rate_inr: number
  bulk_rate_inr: number
  bulk_min_recharge_inr: number
  min_recharge_inr: number
  max_recharge_inr: number
}

export function settingsFromRow(row: SettingsRow | null): AppSettings {
  if (!row) return { upiId: null, payeeName: null, supportContact: null, pricing: DEFAULT_PRICING }
  return {
    upiId: row.upi_id,
    payeeName: row.payee_name,
    supportContact: row.support_contact,
    pricing: {
      freeCreditsPerMonth: row.free_credits_per_month,
      standardRateInr: row.standard_rate_inr,
      bulkRateInr: row.bulk_rate_inr,
      bulkMinRechargeInr: row.bulk_min_recharge_inr,
      minRechargeInr: row.min_recharge_inr,
      maxRechargeInr: row.max_recharge_inr,
    },
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const { data, error } = await supabaseAdmin.from('app_settings').select('*').eq('id', true).maybeSingle()
  if (error) throw dbError(error, 'Unable to load settings')
  return settingsFromRow(data as SettingsRow | null)
}

// The account (made on first sign-in). acceptTerms records agreement to the
// current terms.
export async function getAccount(user: SignedInUser, acceptTerms = false): Promise<Account> {
  const { data, error } = await supabaseAdmin.rpc('get_account', {
    p_user_id: user.id,
    p_accept_terms_version: acceptTerms ? TERMS_VERSION : null,
  })
  if (error) throw dbError(error, 'Unable to load your account')
  return data as Account
}

// ---------------------------------------------------------------------------
// Recharges
// ---------------------------------------------------------------------------

export type RechargeView = {
  id: string
  amountInr: number
  credits: number
  rateInr: number
  utr: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  autoVerified: boolean
  rejectionReason: string | null
  createdAt: string
}

type RechargeRow = {
  id: string
  amount_inr: number
  credits: number
  rate_inr: number
  utr: string
  status: RechargeView['status']
  auto_verified: boolean
  rejection_reason: string | null
  created_at: string
}

const toRechargeView = (row: RechargeRow): RechargeView => ({
  id: row.id,
  amountInr: row.amount_inr,
  credits: row.credits,
  rateInr: row.rate_inr,
  utr: row.utr,
  status: row.status,
  autoVerified: row.auto_verified,
  rejectionReason: row.rejection_reason,
  createdAt: row.created_at,
})

export async function listRecharges(userId: string) {
  const { data, error } = await supabaseAdmin.from('recharges')
    .select('id, amount_inr, credits, rate_inr, utr, status, auto_verified, rejection_reason, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(20)
  if (error) throw dbError(error, 'Unable to load your recharges')
  return (data ?? []).map(row => toRechargeView(row as RechargeRow))
}

const RECHARGE_ERRORS: Record<string, (extra: Record<string, unknown>) => string> = {
  INVALID_UTR: () => 'Enter the 12-digit UPI reference number (UTR) from your payment app.',
  INVALID_AMOUNT: extra => `Recharge between ₹${extra.min} and ₹${Number(extra.max).toLocaleString('en-IN')}.`,
  INVALID_AMOUNT_STEP: extra => `Enter an amount in multiples of ₹${extra.step}.`,
  UTR_ALREADY_USED: () => 'This UPI reference has already been used. Check the number, or contact us if you paid.',
  TOO_MANY_PENDING: () => 'You have 5 recharges waiting to be checked. Please wait for them first.',
}

export async function submitRecharge(user: SignedInUser, body: unknown) {
  const input = (body ?? {}) as { amountInr?: unknown; utr?: unknown }
  const amountInr = Number(input.amountInr)
  const utr = normalizeUtr(String(input.utr ?? ''))
  if (!utr) throw new ApiError(400, 'INVALID_UTR', RECHARGE_ERRORS.INVALID_UTR({}))
  if (!Number.isInteger(amountInr)) throw new ApiError(400, 'INVALID_AMOUNT', 'Enter the amount you paid in whole rupees.')

  const { data, error } = await supabaseAdmin.rpc('submit_recharge', {
    p_user_id: user.id,
    p_email: user.email ?? '',
    p_amount_inr: amountInr,
    p_utr: utr,
  })
  if (error) throw dbError(error, 'Unable to save the recharge')
  const result = data as { error?: string; recharge?: RechargeRow } & Record<string, unknown>
  if (result.error) {
    const message = RECHARGE_ERRORS[result.error]?.(result) ?? 'The recharge could not be saved.'
    throw new ApiError(result.error === 'UTR_ALREADY_USED' ? 409 : 400, result.error, message)
  }
  return toRechargeView(result.recharge as RechargeRow)
}
