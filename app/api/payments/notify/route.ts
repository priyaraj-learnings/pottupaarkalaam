import { handle, json } from '@/lib/server/http'
import { receivePaymentAlert } from '@/lib/server/paymentAlerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Bank credit SMS forwarded from inaivu IT's phone (docs/SETUP.md, "Automatic
// UPI verification"). Authorization: Bearer <PAYMENT_WEBHOOK_SECRET>.
export async function POST(request: Request) {
  return handle(async () => json(await receivePaymentAlert(request)))
}
