import { isCloudTasksRequest } from '@/lib/server/cloudTasks'
import { handle, json, UUID } from '@/lib/server/http'
import { makeLookOnce } from '@/lib/server/looks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Cloud Tasks worker: {"lookId": "..."}. Always answers 200 once the look is
// handled (made, or failed and refunded), so Cloud Tasks does not retry it.
export async function POST(request: Request) {
  return handle(async () => {
    if (!(await isCloudTasksRequest(request))) return json({ error: 'Unauthorized.' }, 401)
    const body = await request.json().catch(() => null) as { lookId?: unknown } | null
    const lookId = typeof body?.lookId === 'string' ? body.lookId : ''
    if (!UUID.test(lookId)) return json({ error: 'Invalid look.' }, 400)
    await makeLookOnce(lookId)
    return json({ done: true })
  })
}
