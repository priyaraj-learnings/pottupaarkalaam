import { handleAdmin } from '@/lib/server/auth'
import { json } from '@/lib/server/http'
import { telegramAction } from '@/lib/server/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// /admin Settings → Telegram alerts: {"action": "connect", "adminUrl"} takes
// the chat that last messaged the bot; "test" sends a test alert; "disconnect"
// stops the alerts.
export async function POST(request: Request) {
  return handleAdmin(request, async () => json(await telegramAction(await request.json().catch(() => null))))
}
