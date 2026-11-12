import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { ApiError, dbError } from '@/lib/server/http'

// Shop QR posters: each shop's code works like an invite code
// (pp.inaivuit.com/?ref=CODE); new customers from it are counted for the shop
// (claim_referral, admin_shops in the database).

export type ShopReport = { code: string; name: string; area: string | null; createdAt: string; signups: number; verified: number; withPictures: number; paidInr: number }

export async function listShops(): Promise<ShopReport[]> {
  const { data, error } = await supabaseAdmin.rpc('admin_shops')
  if (error) throw dbError(error, 'Unable to load the shops')
  return (data ?? []) as ShopReport[]
}

export async function addShop(body: unknown) {
  const input = (body ?? {}) as { name?: unknown; area?: unknown }
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const area = typeof input.area === 'string' ? input.area.trim() : ''
  if (!name || name.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'Enter the shop name (up to 100 letters).')
  if (area.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'Keep the area under 100 letters.')
  // A code that is also a customer's invite code is skipped (rare): try again.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabaseAdmin.from('shops').insert({ name, area: area || null }).select('code').single()
    if (error) throw dbError(error, 'Unable to add the shop')
    const { count } = await supabaseAdmin.from('accounts').select('user_id', { count: 'exact', head: true }).eq('referral_code', data.code)
    if (!count) return listShops()
    await supabaseAdmin.from('shops').delete().eq('code', data.code)
  }
  throw new ApiError(500, 'TRY_AGAIN', 'Please try again.')
}

export async function deleteShop(code: string | null) {
  if (!code || !/^[0-9A-F]{8}$/.test(code)) throw new ApiError(400, 'INVALID_INPUT', 'Unknown shop.')
  const { error } = await supabaseAdmin.from('shops').delete().eq('code', code)
  if (error) throw dbError(error, 'Unable to delete the shop')
  return listShops()
}
