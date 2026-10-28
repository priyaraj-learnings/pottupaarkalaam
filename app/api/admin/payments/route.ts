import { handleAdmin } from '@/lib/server/auth'
import { adminPayments } from '@/lib/server/admin'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ?period=…&status=PENDING|APPROVED|REJECTED
export async function GET(request: Request) {
  return handleAdmin(request, async () => {
    return json(await adminPayments(new URL(request.url).searchParams))
  })
}
