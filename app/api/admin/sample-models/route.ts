import { handleAdmin } from '@/lib/server/auth'
import { json } from '@/lib/server/http'
import { addSampleModel, deleteSampleModel, listSampleModels } from '@/lib/server/samples'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleAdmin(request, async () => json({ models: await listSampleModels() }))
}

// A new sample model (form: photo, label, gender, agreed).
export async function POST(request: Request) {
  return handleAdmin(request, async admin => json({ models: await addSampleModel(admin.id, await request.formData().catch(() => null)) }))
}

// ?id=<uuid>
export async function DELETE(request: Request) {
  return handleAdmin(request, async () => json({ models: await deleteSampleModel(new URL(request.url).searchParams.get('id')) }))
}
