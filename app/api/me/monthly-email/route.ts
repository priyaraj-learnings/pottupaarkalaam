import { requireUser } from '@/lib/server/auth'
import { setMonthlyEmail } from '@/lib/server/growth'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// {"on": true | false}: the monthly "your free pictures are back" email.
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const body = await request.json().catch(() => null) as { on?: unknown } | null
    return json({ account: await setMonthlyEmail(user.id, body?.on === true) })
  })
}
