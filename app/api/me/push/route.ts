import { requireUser } from '@/lib/server/auth'
import { handle, json } from '@/lib/server/http'
import { removePushSubscription, savePushSubscription, vapidPublicKey } from '@/lib/server/push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The public key browsers need to make a push subscription.
export async function GET(request: Request) {
  return handle(async () => {
    await requireUser(request)
    return json({ publicKey: await vapidPublicKey() })
  })
}

// {"endpoint"}: notify this device when pictures are ready.
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    await savePushSubscription(user.id, await request.json().catch(() => null))
    return json({ ok: true })
  })
}

// {"endpoint"}: stop notifying this device.
export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    await removePushSubscription(user.id, await request.json().catch(() => null))
    return json({ ok: true })
  })
}
