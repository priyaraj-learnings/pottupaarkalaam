import { updatePhone } from '@/lib/server/account'
import { requireUser } from '@/lib/server/auth'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The signed-in person's mobile number: {"phone", "offersOk"} saves it,
// {"phone": null} removes it, {"skip": true} is "Not now".
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const account = await updatePhone(user, await request.json().catch(() => null))
    return json({ account })
  })
}
