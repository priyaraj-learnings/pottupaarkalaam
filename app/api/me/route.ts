import { isAdmin, requireUser } from '@/lib/server/auth'
import { acceptTermsAndDataUse, getAccount, loadSettings } from '@/lib/server/account'
import { deleteAccount } from '@/lib/server/deleteAccount'
import { handle, json } from '@/lib/server/http'
import { TERMS_VERSION } from '@/lib/rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The signed-in person, their credits and what the app needs to show prices
// and the UPI payee, and the current terms version (the app asks for consent
// again when the account agreed to an older one). Makes the account on first
// sign-in.
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const [account, settings, admin] = await Promise.all([getAccount(user), loadSettings(), isAdmin(user.id)])
    return json({ user: { email: user.email, name: user.name, phone: user.phone }, account, settings, isAdmin: admin, currentTermsVersion: TERMS_VERSION })
  })
}

// {"acceptTerms": true, "dataConsent": true}: the person ticked both boxes on
// the consent screen (the Terms, and how their data is used).
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const body = await request.json().catch(() => null) as { acceptTerms?: unknown; dataConsent?: unknown } | null
    const account = body?.acceptTerms === true
      ? await acceptTermsAndDataUse(user, body.dataConsent === true, request)
      : await getAccount(user)
    return json({ account })
  })
}

// "Delete my account": photos, pictures, account, credits and sign-in.
export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    return json(await deleteAccount(user, request))
  })
}
