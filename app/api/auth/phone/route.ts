import { handle, json } from '@/lib/server/http'
import { phoneSignIn } from '@/lib/server/phoneLogin'
import { limitByAddress } from '@/lib/server/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// {"accessToken": "<from the MSG91 widget>"} → a one-time token the browser
// exchanges for a Supabase session.
export async function POST(request: Request) {
  return handle(async () => {
    limitByAddress(request, 'phone-sign-in', 10)
    return json(await phoneSignIn(await request.json().catch(() => null)))
  })
}
