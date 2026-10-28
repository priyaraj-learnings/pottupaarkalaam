import { requireAdmin } from '@/lib/server/auth'
import { adminPayments } from '@/lib/server/admin'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ?period=…&status=PENDING|APPROVED|REJECTED
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request)
    return json(await adminPayments(new URL(request.url).searchParams))
  })
}
