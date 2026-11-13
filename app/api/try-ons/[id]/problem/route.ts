import { requireUser } from '@/lib/server/auth'
import { handle, json } from '@/lib/server/http'
import { reportProblem } from '@/lib/server/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "Report a problem" with a finished picture: {"reason", "note"}.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(request)
    const { id } = await params
    return json(await reportProblem(user, id, await request.json().catch(() => null), request))
  })
}
