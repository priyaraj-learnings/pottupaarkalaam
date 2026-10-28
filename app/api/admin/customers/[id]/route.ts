import { handleAdmin } from '@/lib/server/auth'
import { adminCustomer } from '@/lib/server/admin'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// One customer's account, recharges, pictures and credit history.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAdmin(request, async () => {
    const { id } = await params
    return json(await adminCustomer(id))
  })
}
