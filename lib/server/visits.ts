import 'server-only'

import { createHmac } from 'node:crypto'

import { clientIpFromHeaders } from '@/lib/server/clientIp'
import { supabaseAdmin } from '@/lib/supabase/admin'

// =======================================================
// WEBSITE VISITS (/admin Overview)
//
// No cookies, nothing stored in the browser, no third
// party. Each page view sends POST /api/visit; the server
// makes a one-way code from the visitor's address and
// browser with a key that changes every day (India time),
// so the same visitor counts once a day and cannot be
// followed across days. The address itself is never
// stored, and the codes are deleted after their day
// (supabase/migrations/20261030000200_site_visits.sql).
// =======================================================

// Crawlers, link previews and monitors: not visitors.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|go-http|java\/|axios|node-fetch/i

export function isBot(userAgent: string) {
  return !userAgent.trim() || BOT.test(userAgent)
}

export function indiaDay(now: Date) {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10)
}

// The visitor's code for the day. The key is a server secret plus the date,
// so the same visitor gets a different code tomorrow.
export function visitorCode(ip: string, userAgent: string, day: string, secret: string) {
  return createHmac('sha256', `pp-visits:${day}:${secret}`).update(`${ip}|${userAgent}`, 'utf8').digest('hex')
}

export async function recordVisit(request: Request, now = new Date()) {
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 400)
  if (isBot(userAgent)) return { counted: false }
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const code = visitorCode(clientIpFromHeaders(request.headers), userAgent, indiaDay(now), secret)
  const { error } = await supabaseAdmin.rpc('record_site_visit', { p_visitor_code: code })
  // Counting must never break a page: log and carry on.
  if (error) {
    console.error(JSON.stringify({ event: 'visits.record_failed', message: error.message }))
    return { counted: false }
  }
  return { counted: true }
}

// Visitors and page views per India day, from..to (inclusive dates).
export async function visitsBetween(fromDay: string, toDay: string) {
  const { data, error } = await supabaseAdmin.from('site_visit_days')
    .select('day, visitors, page_views').gte('day', fromDay).lte('day', toDay).order('day', { ascending: true })
  // Before the migration runs: no visit numbers rather than a broken page.
  if (error) {
    console.error(JSON.stringify({ event: 'visits.load_failed', message: error.message }))
    return null
  }
  return (data ?? []) as Array<{ day: string; visitors: number; page_views: number }>
}
