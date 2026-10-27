import { requireUser } from '@/lib/server/auth'
import { handle, json } from '@/lib/server/http'
import { history, purgeAllForUser } from '@/lib/server/looks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Pictures from the last 3 days.
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    return json({ looks: await history(user.id) })
  })
}

// "Delete my photos now": every photo and picture of this person, at once.
export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    return json({ deleted: await purgeAllForUser(user.id) })
  })
}
