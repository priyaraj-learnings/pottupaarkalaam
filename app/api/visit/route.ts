import { recordVisit } from '@/lib/server/visits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// One page view (components/VisitCounter.tsx). Always 204: a visitor never
// sees an error from counting.
export async function POST(request: Request) {
  await recordVisit(request).catch(error => {
    console.error(JSON.stringify({ event: 'visits.record_failed', message: error instanceof Error ? error.message : String(error) }))
  })
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
