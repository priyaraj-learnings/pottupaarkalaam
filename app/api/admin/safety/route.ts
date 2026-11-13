import { handleAdmin } from '@/lib/server/auth'
import { json } from '@/lib/server/http'
import { findPicture, safetyAction, safetyOverview } from '@/lib/server/adminSafety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// /admin → Safety. ?picture=pp-… finds one picture; otherwise the open problem
// reports, complaints, blocked accounts and the action log.
export async function GET(request: Request) {
  return handleAdmin(request, async () => {
    const picture = new URL(request.url).searchParams.get('picture')
    return json(picture ? { picture: await findPicture(picture) } : await safetyOverview())
  })
}

// {"action": "block" | "unblock" | "takeDown" | "hold" | "releaseHold" | "resolveProblem" | "complaint", …}
export async function POST(request: Request) {
  return handleAdmin(request, async admin => json(await safetyAction(admin, await request.json().catch(() => null))))
}
