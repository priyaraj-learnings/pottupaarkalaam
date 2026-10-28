import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { ApiError, bearerToken, dbError, handle } from '@/lib/server/http'

export type SignedInUser = {
  id: string
  email: string | null
  name: string | null
}

// The person behind the Supabase access token the app sends.
export async function requireUser(request: Request): Promise<SignedInUser> {
  const token = bearerToken(request)
  if (!token) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'Please sign in.')
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'Please sign in again.')
  const meta = data.user.user_metadata ?? {}
  const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null
  return { id: data.user.id, email: data.user.email ?? null, name }
}

export async function isAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw dbError(error, 'Unable to check admin access')
  return Boolean(data)
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request)
  if (!(await isAdmin(user.id))) throw new ApiError(403, 'ADMIN_ONLY', 'This page is for PottuPaarkalaam admins.')
  return user
}

// Runs an admin route. Unlike customer routes, an unexpected failure shows its
// real reason, so the admin can act on it or pass it on.
export function handleAdmin(request: Request, work: (admin: SignedInUser) => Promise<Response>) {
  return handle(async () => {
    const admin = await requireAdmin(request)
    try {
      return await work(admin)
    } catch (error) {
      if (error instanceof ApiError) throw error
      const reason = error instanceof Error ? error.message : String(error)
      console.error(JSON.stringify({ event: 'api.admin_error', message: reason }))
      // PostgREST has not seen a new column or function yet (PGRST204/PGRST202).
      const hint = /schema cache/i.test(reason)
        ? " Supabase → SQL Editor: run any new files from supabase/migrations, then run  notify pgrst, 'reload schema';  and try again."
        : ''
      throw new ApiError(500, 'ADMIN_ACTION_FAILED', `${reason}.${hint}`)
    }
  })
}
