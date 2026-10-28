import { handleAdmin } from '@/lib/server/auth'
import { adminCustomers } from '@/lib/server/admin'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ?search=&sort=recent|active|paid|pictures&page=0
export async function GET(request: Request) {
  return handleAdmin(request, async () => {
    return json(await adminCustomers(new URL(request.url).searchParams))
  })
}
