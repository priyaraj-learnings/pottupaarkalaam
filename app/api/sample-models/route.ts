import { handle, json } from '@/lib/server/http'
import { listSampleModels } from '@/lib/server/samples'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The sample models customers can try clothes on (also before signing in).
export async function GET() {
  return handle(async () => json({ models: await listSampleModels() }, 200, { 'Cache-Control': 'public, max-age=300' }))
}
