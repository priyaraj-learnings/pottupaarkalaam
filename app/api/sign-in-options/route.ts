import { loadSettings } from '@/lib/server/account'
import { handle, json } from '@/lib/server/http'
import { phoneLoginConfig } from '@/lib/server/phoneLogin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// For the sign-in screen (before anyone is signed in): whether mobile number
// sign-in is set up, with the MSG91 widget's public ID and token, and how many
// free try-ons a month there are (and for invited visitors, the invite reward).
// ?ref=CODE: the invite the visitor came with, to say which shop sent them.
export async function GET(request: Request) {
  return handle(async () => {
    const ref = new URL(request.url).searchParams.get('ref')?.toUpperCase() ?? ''
    const [phone, settings, shop] = await Promise.all([phoneLoginConfig(), loadSettings(), /^[0-9A-F]{8}$/.test(ref)
      ? supabaseAdmin.from('shops').select('name').eq('code', ref).maybeSingle().then(result => (result.data?.name as string | undefined) ?? null, () => null)
      : Promise.resolve(null)])
    return json({ phone, freeCreditsPerMonth: settings.pricing.freeCreditsPerMonth, referralCredits: settings.referralCredits, shop })
  })
}
