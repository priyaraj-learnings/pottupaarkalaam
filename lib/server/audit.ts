import 'server-only'

import { clientIpFromHeaders } from '@/lib/server/clientIp'
import { supabaseAdmin } from '@/lib/supabase/admin'

// =======================================================
// USAGE LOG (DPDP Rules 2025, rule 8(3) and the Seventh
// Schedule: keep a record of processing for one year; also
// the CERT-In 2022 directions on logs). One row per thing a
// customer did: what, when, which try or recharge, and the
// internet address it came from. No photos, names or emails.
// Kept 1 year (purge_compliance_records).
// =======================================================

export type UsageEvent =
  | 'TERMS_ACCEPTED' | 'DATA_CONSENT' | 'PHONE_VERIFIED'
  | 'TRY_ON_CREATED' | 'COUPLE_CREATED' | 'PICTURE_MADE' | 'PICTURE_FAILED' | 'PICTURE_DOWNLOADED'
  | 'PHOTOS_DELETED' | 'PROBLEM_REPORTED' | 'RECHARGE_SUBMITTED' | 'COMPLAINT_SENT' | 'ACCOUNT_DELETED'

// Never throws: the customer's request goes ahead even if logging fails.
export async function logEvent(userId: string | null, event: UsageEvent, refId?: string | null, request?: Request | null) {
  try {
    const ip = request ? clientIpFromHeaders(request.headers) || null : null
    const { error } = await supabaseAdmin.from('processing_log').insert({ user_id: userId, event, ref_id: refId ?? null, ip })
    if (error) throw new Error(error.message)
  } catch (error) {
    console.error(JSON.stringify({ event: 'usage_log.failed', what: event, message: error instanceof Error ? error.message : String(error) }))
  }
}
