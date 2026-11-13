import { requireUser, type SignedInUser } from '@/lib/server/auth'
import { handle, json } from '@/lib/server/http'
import { limitByAddress } from '@/lib/server/rateLimit'
import { sendComplaint } from '@/lib/server/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The public complaints form (/complaints): {"name", "contact", "category",
// "pictureId", "details"}. Signed-in customers' complaints are linked to them.
// Answers {"ticket": "PPC-…", "urgent": true | false}.
export async function POST(request: Request) {
  return handle(async () => {
    limitByAddress(request, 'complaint', 5, 60 * 60_000)
    let user: SignedInUser | null = null
    if (request.headers.get('authorization')) user = await requireUser(request).catch(() => null)
    return json(await sendComplaint(user, await request.json().catch(() => null), request), 201)
  })
}
