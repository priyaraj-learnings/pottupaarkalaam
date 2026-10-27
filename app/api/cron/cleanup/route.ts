import { ApiError, bearerToken, handle, json, secretMatches } from '@/lib/server/http'
import { purgeExpired } from '@/lib/server/looks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Hourly (Cloud Scheduler, Authorization: Bearer <CRON_SECRET>): deletes photos
// and pictures older than 3 days and refunds pictures that never finished.
export async function POST(request: Request) {
  return handle(async () => {
    if (!process.env.CRON_SECRET?.trim()) throw new ApiError(503, 'NOT_CONFIGURED', 'CRON_SECRET is not set.')
    if (!secretMatches(bearerToken(request), process.env.CRON_SECRET)) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized.')
    return json(await purgeExpired())
  })
}
