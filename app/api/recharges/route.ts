import { after } from 'next/server'

import { requireUser } from '@/lib/server/auth'
import { getAccount, listRecharges, submitRecharge } from '@/lib/server/account'
import { handle, json } from '@/lib/server/http'
import { alertRechargeToCheck } from '@/lib/server/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    return json({ recharges: await listRecharges(user.id) })
  })
}

// {"amountInr": 500, "utr": "629912345678"} after paying by UPI. Approved at
// once when the bank's alert for it has arrived, otherwise checked by an admin.
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const recharge = await submitRecharge(user, await request.json().catch(() => null))
    // Waiting for an admin: a Telegram alert, after the reply (if set up).
    if (recharge.status === 'PENDING') after(() => alertRechargeToCheck(recharge))
    return json({ recharge, account: await getAccount(user) }, 201)
  })
}
