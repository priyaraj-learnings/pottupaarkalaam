import 'server-only'

import { DEFAULT_COUPLE_CREDITS, DEFAULT_PRICING, type StarterPack, formatMobile, normalizeMobile, normalizeUtr, TERMS_VERSION, type Pricing } from '@/lib/rules'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { SignedInUser } from '@/lib/server/auth'
import { ApiError, dbError } from '@/lib/server/http'
import { logEvent } from '@/lib/server/audit'
import { settleReferral } from '@/lib/server/growth'
import { msg91Settings, verifyMsg91Token } from '@/lib/server/phoneLogin'

export type Account = {
  credits: number
  freeCreditsPerMonth: number
  freeLeft: number
  termsVersion: string | null
  termsAcceptedAt: string | null
  phone: string | null
  phoneVerified: boolean
  offersOk: boolean
  phoneAskedAt: string | null
  // The customer chose to show couple pictures.
  coupleOptIn: boolean
  // A recharge approved this month: may add extra photos to a try.
  paidThisMonth: boolean
  // "Send me offers and news by email" (separate from offersOk: WhatsApp / SMS).
  emailOffersOk: boolean
  // The monthly "your free pictures are back" email (off = unsubscribed).
  monthlyEmailOk: boolean
  // Refer a friend: the invite code (link pp.inaivuit.com/?ref=CODE), the
  // credits each side gets, and how many friends have joined through it.
  referralCode: string
  referralCredits: number
  friendsJoined: number
  // The starter pack is still open to this account (no recharge yet).
  starterAvailable: boolean
  // Finished pictures made so far (for the "Rate us" card).
  completedPictures: number
  // Blocked by the admin for breaking the Terms (cannot make pictures or pay).
  blocked: boolean
  blockedReason: string | null
  // When the itemised "how my data is used" notice was agreed to (null: ask).
  dataConsentAt: string | null
}

export type AppSettings = {
  upiId: string | null
  // The business's own UPI QR text (merchant details for the pay links).
  upiQrText: string | null
  // Phones show "pay with <app>" link buttons (off while the business UPI ID
  // is not verified: UPI declines link payments to it, but not QR scans).
  upiAppButtons: boolean
  payeeName: string | null
  supportContact: string | null
  pricing: Pricing
  // The MSG91 OTP widget's public values, when mobile verification is set up.
  // Free credits always need a verified number (free_left in the database).
  phoneWidget: { widgetId: string; tokenAuth: string } | null
  // Couple pictures: on for the whole app, and their price in paid credits.
  couple: { enabled: boolean; credits: number }
  // A 4th and 5th photo per try for customers who recharged this month, each
  // costing `credits` more (paid credits only).
  extraPhotos: { enabled: boolean; credits: number }
  // Refer a friend: credits each side gets (0: off), for up to
  // referralMaxPerPerson friends each.
  referralCredits: number
  referralMaxPerPerson: number
  // The starter pack (first recharge only), or null when off.
  starterPack: StarterPack | null
  // "Rate us on Google" link, or null.
  googleReviewUrl: string | null
  // On receipts, once registered for GST.
  gstin: string | null
}

type SettingsRow = {
  upi_id: string | null
  payee_name: string | null
  upi_qr_text?: string | null
  upi_app_buttons?: boolean
  support_contact: string | null
  msg91_widget_id?: string | null
  msg91_token_auth?: string | null
  msg91_auth_key?: string | null
  couple_enabled?: boolean
  couple_credits?: number
  extra_photos_enabled?: boolean
  extra_photo_credits?: number
  referral_credits?: number
  referral_max_per_person?: number
  starter_pack_inr?: number
  starter_pack_credits?: number
  google_review_url?: string | null
  gstin?: string | null
  free_credits_per_month: number
  standard_rate_inr: number
  bulk_rate_inr: number
  bulk_min_recharge_inr: number
  min_recharge_inr: number
  max_recharge_inr: number
}

export function settingsFromRow(row: SettingsRow | null): AppSettings {
  if (!row) {
    return { upiId: null, upiQrText: null, upiAppButtons: false, payeeName: null, supportContact: null, pricing: DEFAULT_PRICING, phoneWidget: null,
      couple: { enabled: false, credits: DEFAULT_COUPLE_CREDITS }, extraPhotos: { enabled: false, credits: 1 }, referralCredits: 0, referralMaxPerPerson: 0, starterPack: null, googleReviewUrl: null, gstin: null }
  }
  // Never the auth key: these settings go to the browser.
  const widgetId = row.msg91_widget_id?.trim()
  const tokenAuth = row.msg91_token_auth?.trim()
  const phoneWidget = widgetId && tokenAuth && row.msg91_auth_key?.trim() ? { widgetId, tokenAuth } : null
  return {
    upiId: row.upi_id,
    upiQrText: row.upi_qr_text ?? null,
    upiAppButtons: row.upi_app_buttons ?? true,
    payeeName: row.payee_name,
    supportContact: row.support_contact,
    phoneWidget,
    couple: { enabled: Boolean(row.couple_enabled), credits: row.couple_credits ?? DEFAULT_COUPLE_CREDITS },
    extraPhotos: { enabled: Boolean(row.extra_photos_enabled), credits: row.extra_photo_credits ?? 1 },
    referralCredits: row.referral_credits ?? 0,
    referralMaxPerPerson: row.referral_max_per_person ?? 0,
    starterPack: (row.starter_pack_inr ?? 0) > 0 && (row.starter_pack_credits ?? 0) > 0
      ? { amountInr: row.starter_pack_inr as number, credits: row.starter_pack_credits as number } : null,
    googleReviewUrl: row.google_review_url?.trim() || null,
    gstin: row.gstin ?? null,
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

// The consent screen's two ticks: the Terms, and the itemised "how my data is
// used" notice (DPDP Rules 2025, rule 3). Both are recorded with this version.
export async function acceptTermsAndDataUse(user: SignedInUser, dataConsent: boolean, request: Request): Promise<Account> {
  if (!dataConsent) throw new ApiError(400, 'CONSENT_REQUIRED', 'Please tick both boxes to continue.')
  await getAccount(user, true)
  const { error } = await supabaseAdmin.from('accounts')
    .update({ data_consent_at: new Date().toISOString(), data_consent_version: TERMS_VERSION }).eq('user_id', user.id)
  if (error) throw dbError(error, 'Unable to save your consent')
  void logEvent(user.id, 'TERMS_ACCEPTED', null, request)
  void logEvent(user.id, 'DATA_CONSENT', null, request)
  return getAccount(user)
}

// {"phone": "98765 43210", "offersOk": true} saves a typed mobile number,
// {"phone": null} removes it, {"skip": true} is "Not now", and
// {"accessToken": "<from the MSG91 widget>", "offersOk": true} saves the number
// MSG91 verified by an SMS code.
export async function updatePhone(user: SignedInUser, body: unknown): Promise<Account> {
  const input = (body ?? {}) as { phone?: unknown; offersOk?: unknown; skip?: unknown; accessToken?: unknown }
  if (typeof input.accessToken === 'string') {
    return verifyMobile(user.id, input.accessToken, typeof input.offersOk === 'boolean' ? input.offersOk : null)
  }
  if (input.skip === true) {
    const { data, error } = await supabaseAdmin.rpc('skip_phone', { p_user_id: user.id })
    if (error) throw dbError(error, 'Unable to update your account')
    return data as Account
  }
  let phone: string | null = null
  if (input.phone !== null) {
    phone = typeof input.phone === 'string' ? normalizeMobile(input.phone) : null
    if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Enter your 10-digit mobile number.')
  }
  const { data, error } = await supabaseAdmin.rpc('save_phone', {
    p_user_id: user.id,
    p_phone: phone,
    p_offers_ok: input.offersOk === true,
  })
  if (error && /PHONE_VERIFIED/.test(error.message)) {
    throw new ApiError(400, 'PHONE_VERIFIED', 'Your number is verified. To change it, verify the new number with an SMS code.')
  }
  if (error) throw dbError(error, 'Unable to save your mobile number')
  return data as Account
}

export const PHONE_TAKEN_MESSAGE = 'This mobile number already belongs to another PottuPaarkalaam account. '
  + 'Sign in to that account instead (with Google, email or "Sign in with mobile number").'

// Saves the number MSG91 verified for this widget token to the account.
export async function verifyMobile(userId: string, accessToken: string, offersOk: boolean | null): Promise<Account> {
  const { authKey } = await msg91Settings()
  if (!authKey) throw new ApiError(503, 'NOT_CONFIGURED', 'Mobile number verification is not available yet.')
  const phone = await verifyMsg91Token(accessToken.trim(), authKey)
  const { data, error } = await supabaseAdmin.rpc('verify_phone', { p_user_id: userId, p_phone: phone, p_offers_ok: offersOk })
  if (error) throw dbError(error, 'Unable to save your mobile number')
  const result = data as { account?: Account; error?: string }
  if (result.error === 'PHONE_TAKEN') throw new ApiError(409, 'PHONE_TAKEN', PHONE_TAKEN_MESSAGE)
  // Joined through a friend's invite: both get their credits now.
  if ((await settleReferral(userId))?.rewarded) {
    const again = await supabaseAdmin.rpc('get_account', { p_user_id: userId, p_accept_terms_version: null })
    if (!again.error) return again.data as Account
  }
  return result.account as Account
}

// The customer's "Couple pictures" switch.
export async function setCoupleOptIn(user: SignedInUser, body: unknown): Promise<Account> {
  const on = (body as { on?: unknown } | null)?.on === true
  const { data, error } = await supabaseAdmin.rpc('set_couple_opt_in', { p_user_id: user.id, p_on: on })
  if (error) throw dbError(error, 'Unable to update your account')
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
  receiptNo: string | null
  approvedAt: string | null
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
  receipt_no?: string | null
  reviewed_at?: string | null
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
  receiptNo: row.receipt_no ?? null,
  approvedAt: row.status === 'APPROVED' ? row.reviewed_at ?? row.created_at : null,
})

export async function listRecharges(userId: string) {
  const { data, error } = await supabaseAdmin.from('recharges')
    .select('id, amount_inr, credits, rate_inr, utr, status, auto_verified, rejection_reason, created_at, receipt_no, reviewed_at')
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
  if ((await getAccount(user)).blocked) {
    throw new ApiError(403, 'ACCOUNT_BLOCKED', 'This account is blocked for breaking the Terms of Use, so it cannot be recharged. Write to us from the Complaints page if you paid.')
  }

  const { data, error } = await supabaseAdmin.rpc('submit_recharge', {
    p_user_id: user.id,
    // Shown to the admin with the recharge: the email, or the mobile number.
    p_email: user.email ?? (user.phone ? `+91 ${formatMobile(user.phone)}` : ''),
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
