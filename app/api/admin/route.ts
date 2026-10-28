import { handleAdmin } from '@/lib/server/auth'
import { adminOverview, updateSettings } from '@/lib/server/admin'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleAdmin(request, async () => {
    return json(await adminOverview())
  })
}

// Settings: UPI payee, prices, free credits.
export async function PATCH(request: Request) {
  return handleAdmin(request, async admin => {
    return json(await updateSettings(admin.id, await request.json().catch(() => null)))
  })
}
