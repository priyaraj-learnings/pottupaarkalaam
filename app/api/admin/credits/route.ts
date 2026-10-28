import { handleAdmin } from '@/lib/server/auth'
import { adjustCredits } from '@/lib/server/admin'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// {"email": "...", "credits": 5, "reason": "..."}: give (or take back) paid credits.
export async function POST(request: Request) {
  return handleAdmin(request, async admin => {
    return json(await adjustCredits(admin.id, await request.json().catch(() => null)))
  })
}
