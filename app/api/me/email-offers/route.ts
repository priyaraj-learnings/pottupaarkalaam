import { requireUser } from '@/lib/server/auth'
import { setEmailOffers } from '@/lib/server/growth'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// {"on": true | false}: "Send me offers and news by email".
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    return json({ account: await setEmailOffers(user, await request.json().catch(() => null)) })
  })
}
