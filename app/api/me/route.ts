import { isAdmin, requireUser } from '@/lib/server/auth'
import { getAccount, loadSettings } from '@/lib/server/account'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The signed-in person, their credits and what the app needs to show prices
// and the UPI payee. Makes the account on first sign-in.
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const [account, settings, admin] = await Promise.all([getAccount(user), loadSettings(), isAdmin(user.id)])
    return json({ user: { email: user.email, name: user.name }, account, settings, isAdmin: admin })
  })
}

// {"acceptTerms": true}: the person agreed to the current terms.
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const body = await request.json().catch(() => null) as { acceptTerms?: unknown } | null
    const account = await getAccount(user, body?.acceptTerms === true)
    return json({ account })
  })
}
