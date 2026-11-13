import 'server-only'

import { isAdmin, type SignedInUser } from '@/lib/server/auth'
import { ApiError, dbError } from '@/lib/server/http'
import { logEvent } from '@/lib/server/audit'
import { purgeAllForUser } from '@/lib/server/looks'
import { supabaseAdmin } from '@/lib/supabase/admin'

// "Delete my account" (DPDP Act 2023, sections 6(4) and 12): the photos and
// pictures first, then the account, credits, mobile number and sign-in.
// Payment records stay for the tax records, without the person
// (migration 20261029000600_delete_account.sql). Photos held as evidence by the
// admin (try_on_batches.hold_until) stay until the hold ends.
export async function deleteAccount(user: SignedInUser, request?: Request) {
  if (await isAdmin(user.id)) {
    throw new ApiError(403, 'ADMIN_ACCOUNT', 'Admin accounts cannot be deleted from the app. Remove the admin role first.')
  }
  // Under review (blocked, or photos held as evidence): kept until the review
  // ends, as the IT Rules require; the person can write to us meanwhile.
  const [{ data: account0 }, { count: held }] = await Promise.all([
    supabaseAdmin.from('accounts').select('blocked_at').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('try_on_batches').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gt('hold_until', new Date().toISOString()),
  ])
  if (account0?.blocked_at || (held ?? 0) > 0) {
    throw new ApiError(409, 'UNDER_REVIEW', 'This account is under review, so it cannot be deleted yet. Write to us from the Complaints page and we will delete it once the review is finished.')
  }
  await purgeAllForUser(user.id)
  // The bank's messages about this person's payments lose the payer's name.
  const { error: alertsError } = await supabaseAdmin.rpc('forget_payment_alerts', { p_user_id: user.id })
  if (alertsError) throw dbError(alertsError, 'Unable to delete your account')
  // The sign-in details are kept 180 days (IT Rules 2021, rule 3(1)(h)), only
  // for investigations the law requires; then deleted (purge_compliance_records).
  const { data: account } = await supabaseAdmin.from('accounts').select('phone, created_at').eq('user_id', user.id).maybeSingle()
  const { error: keepError } = await supabaseAdmin.from('deleted_registrations').insert({
    user_id: user.id, email: user.email, phone: (account?.phone as string | null) ?? user.phone, name: user.name,
    signed_up_at: (account?.created_at as string | null) ?? null,
  })
  if (keepError) throw dbError(keepError, 'Unable to delete your account')
  await logEvent(user.id, 'ACCOUNT_DELETED', null, request)
  const { error } = await supabaseAdmin.rpc('prepare_account_deletion', { p_user_id: user.id })
  if (error) throw dbError(error, 'Unable to delete your account')
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
  if (authError) throw new ApiError(500, 'DELETE_FAILED', 'Your photos are deleted, but the account could not be deleted. Please try again.')
  console.info(JSON.stringify({ event: 'account.deleted', userId: user.id }))
  return { deleted: true }
}
