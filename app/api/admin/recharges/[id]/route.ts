import { handleAdmin } from '@/lib/server/auth'
import { reviewRecharge } from '@/lib/server/admin'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// {"decision": "APPROVE" | "REJECT", "reason": "..."}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAdmin(request, async admin => {
    const { id } = await params
    return json(await reviewRecharge(admin.id, id, await request.json().catch(() => null)))
  })
}
