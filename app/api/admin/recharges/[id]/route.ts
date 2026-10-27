import { requireAdmin } from '@/lib/server/auth'
import { reviewRecharge } from '@/lib/server/admin'
import { handle, json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// {"decision": "APPROVE" | "REJECT", "reason": "..."}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(request)
    const { id } = await params
    return json(await reviewRecharge(admin.id, id, await request.json().catch(() => null)))
  })
}
