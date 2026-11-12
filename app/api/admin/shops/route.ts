import { handleAdmin } from '@/lib/server/auth'
import { json } from '@/lib/server/http'
import { addShop, deleteShop, listShops } from '@/lib/server/shops'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Shops with QR posters, and the customers each one brought.
export async function GET(request: Request) {
  return handleAdmin(request, async () => json({ shops: await listShops() }))
}

// {"name", "area"}: a new shop and its poster code.
export async function POST(request: Request) {
  return handleAdmin(request, async () => json({ shops: await addShop(await request.json().catch(() => null)) }))
}

// ?code=AB12CD34 (its customers stay; they are no longer counted for a shop).
export async function DELETE(request: Request) {
  return handleAdmin(request, async () => json({ shops: await deleteShop(new URL(request.url).searchParams.get('code')) }))
}
