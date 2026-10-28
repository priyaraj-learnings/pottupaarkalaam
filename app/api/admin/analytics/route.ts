import { requireAdmin } from '@/lib/server/auth'
import { adminAnalytics, isPeriod } from '@/lib/server/admin'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ?period=this-month | last-month | last-7-days | last-30-days | all
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request)
    const period = new URL(request.url).searchParams.get('period')
    return json(await adminAnalytics(isPeriod(period) ? period : 'this-month'))
  })
}
