import { requireUser } from '@/lib/server/auth'
import { handle } from '@/lib/server/http'
import { lookAsJpeg } from '@/lib/server/looks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The finished picture as a JPEG, for "Save to gallery" and "Share".
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(request)
    const { id } = await params
    const jpeg = await lookAsJpeg(user.id, id)
    return new Response(new Uint8Array(jpeg), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="pottupaarkalaam-${id.slice(0, 8)}.jpg"`,
        'Cache-Control': 'private, no-store',
      },
    })
  })
}
