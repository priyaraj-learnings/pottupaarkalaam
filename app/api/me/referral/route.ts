import { requireUser } from '@/lib/server/auth'
import { claimReferral } from '@/lib/server/growth'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// {"code": "AB12CD34"}: this new account came from a friend's invite link.
// Answers {"rewarded": true, "credits": 2}, or {"rewarded": false, "reason"}
// (e.g. NOT_VERIFIED: the reward comes when the mobile number is verified).
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    return json(await claimReferral(user, await request.json().catch(() => null)))
  })
}
