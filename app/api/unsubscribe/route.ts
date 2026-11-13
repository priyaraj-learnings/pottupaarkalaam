import { clientIpFromHeaders } from '@/lib/server/clientIp'
import { setMonthlyEmail } from '@/lib/server/growth'
import { allowRequest } from '@/lib/server/rateLimit'
import { unsubscribeSecret, unsubscribeTokenMatches } from '@/lib/server/email'
import { UUID } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The "Stop these emails" link in the monthly email. Opening the link shows a
// button (mail scanners open links, so a visit alone changes nothing); the
// button, and mail apps' one-click unsubscribe (RFC 8058), POST here.

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} · PottuPaarkalaam</title></head>
<body style="margin:0;background:#fdf6f0;font-family:Arial,Helvetica,sans-serif;color:#292524">
<main style="max-width:460px;margin:0 auto;padding:40px 18px">
<p style="font-size:20px;font-weight:bold;color:#9f1239">PottuPaarkalaam</p>
<h1 style="font-size:22px">${title}</h1>${body}</main></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function link(request: Request) {
  const url = new URL(request.url)
  const userId = url.searchParams.get('u') ?? ''
  const token = url.searchParams.get('t') ?? ''
  try {
    return UUID.test(userId) && token.length <= 64 && unsubscribeTokenMatches(userId, token, await unsubscribeSecret()) ? { userId, token } : null
  } catch {
    return null
  }
}

const BAD_LINK = () => page('This link does not work', '<p>Open the app, then the menu (☰), and switch off <b>Monthly email</b> there.</p>', 400)

export async function GET(request: Request) {
  const valid = await link(request)
  if (!valid) return BAD_LINK()
  const action = `/api/unsubscribe?u=${encodeURIComponent(valid.userId)}&t=${encodeURIComponent(valid.token)}`
  return page('Stop the monthly email?', `<p>We send one email a month when your free pictures are back. Press the button to stop it.</p>
<form method="post" action="${action}"><button type="submit" style="background:#9f1239;color:#fff;border:0;border-radius:12px;padding:12px 22px;font-size:16px;font-weight:bold">Stop these emails</button></form>`)
}

export async function POST(request: Request) {
  if (!allowRequest(`unsubscribe:${clientIpFromHeaders(request.headers)}`, 20, 60_000)) return page('Please wait', '<p>Too many tries. Please wait a minute and try again.</p>', 429)
  const valid = await link(request)
  if (!valid) return BAD_LINK()
  try {
    await setMonthlyEmail(valid.userId, false)
  } catch (error) {
    console.error(JSON.stringify({ event: 'email.unsubscribe_failed', message: error instanceof Error ? error.message : String(error) }))
    return page('Something went wrong', '<p>Please try again in a minute.</p>', 500)
  }
  return page('Done: no more monthly emails', '<p>You can switch it back on any time in the app: menu (☰) → <b>Monthly email</b>.</p>')
}
