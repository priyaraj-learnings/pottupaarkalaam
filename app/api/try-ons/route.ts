import { requireUser } from '@/lib/server/auth'
import { ApiError, handle, json } from '@/lib/server/http'
import { createTryOns, looksById } from '@/lib/server/looks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The pictures are made after the reply (next/server after()).
export const maxDuration = 300

// Multipart form: photo (the customer), garment (up to 5 files), garments
// (JSON [{category, source}] in the same order) and pairs (JSON [[i, j]]).
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const form = await request.formData().catch(() => null)
    if (!form) throw new ApiError(400, 'INVALID_INPUT', 'Send the photos as a form upload.')
    return json(await createTryOns(user, form), 202)
  })
}

// ?ids=a,b,c — progress and finished pictures.
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',')
    return json({ looks: await looksById(user.id, ids) })
  })
}
