export const dynamic = 'force-dynamic'

// For the deploy check and uptime monitoring.
export function GET() {
  return Response.json({ ok: true, release: process.env.APP_RELEASE_ID ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
