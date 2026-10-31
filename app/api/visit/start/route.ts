import { recordVisit } from '@/lib/server/visits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A visitor added a first photo (lib/client/visits.ts): "Started a try-on" in
// the /admin funnel. Always 204.
export async function POST(request: Request) {
  await recordVisit(request, new Date(), 'start').catch(error => {
    console.error(JSON.stringify({ event: 'visits.start_failed', message: error instanceof Error ? error.message : String(error) }))
  })
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
