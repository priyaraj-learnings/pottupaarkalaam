import { loadSettings } from '@/lib/server/account'
import { handle, json } from '@/lib/server/http'
import { phoneLoginConfig } from '@/lib/server/phoneLogin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// For the sign-in screen (before anyone is signed in): whether mobile number
// sign-in is set up, with the MSG91 widget's public ID and token, and how many
// free try-ons a month there are.
export async function GET() {
  return handle(async () => {
    const [phone, settings] = await Promise.all([phoneLoginConfig(), loadSettings()])
    return json({ phone, freeCreditsPerMonth: settings.pricing.freeCreditsPerMonth })
  })
}
