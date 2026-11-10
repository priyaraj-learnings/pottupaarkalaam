import { handleAdmin } from '@/lib/server/auth'
import { emailAction } from '@/lib/server/email'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// /admin Settings → Email: {"action": "save", "apiKey", "from",
// "monthlyEnabled", "appUrl"} or {"action": "test"} (a test of the monthly
// email to the admin's own address).
export async function POST(request: Request) {
  return handleAdmin(request, async admin => json(await emailAction(admin, await request.json().catch(() => null))))
}
