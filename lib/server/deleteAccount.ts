import 'server-only'

import { isAdmin, type SignedInUser } from '@/lib/server/auth'
import { ApiError, dbError } from '@/lib/server/http'
import { purgeAllForUser } from '@/lib/server/looks'
import { supabaseAdmin } from '@/lib/supabase/admin'

// "Delete my account" (DPDP Act 2023, sections 6(4) and 12): the photos and
// pictures first, then the account, credits, mobile number and sign-in.
// Payment records stay for the tax records, without the person
// (migration 20261029000600_delete_account.sql).
export async function deleteAccount(user: SignedInUser) {
  if (await isAdmin(user.id)) {
    throw new ApiError(403, 'ADMIN_ACCOUNT', 'Admin accounts cannot be deleted from the app. Remove the admin role first.')
  }
  await purgeAllForUser(user.id)
  const { error } = await supabaseAdmin.rpc('prepare_account_deletion', { p_user_id: user.id })
  if (error) throw dbError(error, 'Unable to delete your account')
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
  if (authError) throw new ApiError(500, 'DELETE_FAILED', 'Your photos are deleted, but the account could not be deleted. Please try again.')
  console.info(JSON.stringify({ event: 'account.deleted', userId: user.id }))
  return { deleted: true }
}
