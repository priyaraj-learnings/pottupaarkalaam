import 'server-only'

import type { Account } from '@/lib/server/account'
import type { SignedInUser } from '@/lib/server/auth'
import { ApiError, dbError } from '@/lib/server/http'
import { supabaseAdmin } from '@/lib/supabase/admin'

// The customer's "Send me offers and news by email" tick.
export async function setEmailOffers(user: SignedInUser, body: unknown): Promise<Account> {
  const on = (body as { on?: unknown } | null)?.on === true
  const { data, error } = await supabaseAdmin.rpc('set_email_offers', { p_user_id: user.id, p_on: on })
  if (error) throw dbError(error, 'Unable to update your account')
  return data as Account
}

// The "monthly email" switch in the account menu.
export async function setMonthlyEmail(userId: string, on: boolean): Promise<Account> {
  const { data, error } = await supabaseAdmin.rpc('set_monthly_email', { p_user_id: userId, p_on: on })
  if (error) throw dbError(error, 'Unable to update your account')
  return data as Account
}

export type ReferralResult = { rewarded: boolean; credits?: number; reason?: string }

export const REFERRAL_CODE = /^[0-9A-Fa-f]{8}$/

// A new account opened from a friend's invite link (?ref=CODE). Both get the
// reward once the new account's mobile number is verified (now, or later in
// verifyMobile).
export async function claimReferral(user: SignedInUser, body: unknown): Promise<ReferralResult> {
  const code = (body as { code?: unknown } | null)?.code
  if (typeof code !== 'string' || !REFERRAL_CODE.test(code.trim())) throw new ApiError(400, 'INVALID_INPUT', 'That invite link is not right.')
  const { data, error } = await supabaseAdmin.rpc('claim_referral', { p_user_id: user.id, p_code: code.trim() })
  if (error) throw dbError(error, 'Unable to save the invite')
  return data as ReferralResult
}

// After a mobile number is verified. Never throws: verifying still works.
export async function settleReferral(userId: string): Promise<ReferralResult | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('settle_referral', { p_referee: userId })
    if (error) throw dbError(error, 'Unable to settle the invite')
    return data as ReferralResult
  } catch (error) {
    console.error(JSON.stringify({ event: 'referral.settle_failed', message: error instanceof Error ? error.message : String(error) }))
    return null
  }
}
