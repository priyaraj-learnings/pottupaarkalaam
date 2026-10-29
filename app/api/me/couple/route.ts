import { setCoupleOptIn } from '@/lib/server/account'
import { requireUser } from '@/lib/server/auth'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// {"on": true | false}: the customer's "Couple pictures" switch.
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    return json({ account: await setCoupleOptIn(user, await request.json().catch(() => null)) })
  })
}
