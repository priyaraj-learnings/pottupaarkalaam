import { requireUser } from '@/lib/server/auth'
import { ApiError, handle, json } from '@/lib/server/http'
import { createCouple } from '@/lib/server/looks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The picture is made after the reply (next/server after()) when Cloud Tasks
// is not set up.
export const maxDuration = 300

// Multipart form: hisPhoto, hisGarment, herPhoto, herGarment, garments (JSON
// {"his": {category, source}, "her": {category, source}}) and consent. Progress:
// GET /api/try-ons?ids=…
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request)
    const form = await request.formData().catch(() => null)
    if (!form) throw new ApiError(400, 'INVALID_INPUT', 'Send the photos as a form upload.')
    return json(await createCouple(user, form), 202)
  })
}
