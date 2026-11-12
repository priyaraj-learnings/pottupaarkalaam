import 'server-only'

import { createPrivateKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { ApiError, dbError } from '@/lib/server/http'

// =======================================================
// PICTURE-READY NOTIFICATIONS (Web Push)
//
// A customer who taps "Tell me when it's ready" lets the
// browser make a push subscription, saved here. When the last
// picture of a try is finished, the app sends an empty push to
// each of their subscriptions; the phone's service worker
// (public/sw.js) shows "Your picture is ready" and opens the
// app. Empty pushes need no encryption, only a signed VAPID
// token: the key pair is made on first use and kept in
// app_settings (the private key never leaves the server).
// =======================================================

const b64url = (buffer: Buffer) => buffer.toString('base64url')

// Push services of Chrome / Android, Firefox, Edge / Windows and Safari / iPhone.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/]

export function isPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && endpoint.length <= 1000 && PUSH_HOSTS.some(host => host.test(url.hostname))
  } catch {
    return false
  }
}

type Keys = { publicKey: string; privateKey: KeyObject }

let cached: Keys | null = null

// The uncompressed public point (65 bytes), as browsers want it.
function rawPublicKey(jwk: { x?: string; y?: string }) {
  return b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x ?? '', 'base64url'), Buffer.from(jwk.y ?? '', 'base64url')]))
}

async function vapidKeys(): Promise<Keys> {
  if (cached) return cached
  const { data, error } = await supabaseAdmin.from('app_settings').select('vapid_public_key, vapid_private_key').eq('id', true).maybeSingle()
  if (error) throw dbError(error, 'Unable to load notification keys')
  const row = data as { vapid_public_key: string | null; vapid_private_key: string | null } | null
  if (row?.vapid_public_key && row.vapid_private_key) {
    cached = { publicKey: row.vapid_public_key, privateKey: createPrivateKey({ key: JSON.parse(row.vapid_private_key), format: 'jwk' }) }
    return cached
  }
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = pair.privateKey.export({ format: 'jwk' })
  const publicKey = rawPublicKey(jwk)
  // Only if no other server saved a pair meanwhile; then use whichever is saved.
  await supabaseAdmin.from('app_settings').update({ vapid_public_key: publicKey, vapid_private_key: JSON.stringify(jwk) })
    .eq('id', true).is('vapid_private_key', null)
  cached = null
  const again = await supabaseAdmin.from('app_settings').select('vapid_public_key, vapid_private_key').eq('id', true).maybeSingle()
  const saved = again.data as { vapid_public_key: string | null; vapid_private_key: string | null } | null
  if (!saved?.vapid_public_key || !saved.vapid_private_key) throw new ApiError(503, 'NOT_CONFIGURED', 'Notifications are not available yet.')
  cached = { publicKey: saved.vapid_public_key, privateKey: createPrivateKey({ key: JSON.parse(saved.vapid_private_key), format: 'jwk' }) }
  return cached
}

export async function vapidPublicKey() {
  return (await vapidKeys()).publicKey
}

// The VAPID token for one push service (RFC 8292), valid 12 hours.
export function vapidToken(audience: string, privateKey: KeyObject, now = Date.now()) {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: 'mailto:grievance@inaivuit.com' })))
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${header}.${claims}.${b64url(signature)}`
}

// {"endpoint": "https://fcm.googleapis.com/..."} from the browser. At most 5
// devices per customer (the oldest go).
export async function savePushSubscription(userId: string, body: unknown) {
  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint
  if (typeof endpoint !== 'string' || !isPushEndpoint(endpoint)) throw new ApiError(400, 'INVALID_INPUT', 'This browser cannot get notifications.')
  const { error } = await supabaseAdmin.from('push_subscriptions').upsert({ endpoint, user_id: userId }, { onConflict: 'endpoint' })
  if (error) throw dbError(error, 'Unable to save the notification setting')
  const { data } = await supabaseAdmin.from('push_subscriptions').select('endpoint').eq('user_id', userId).order('created_at', { ascending: false })
  const extra = (data ?? []).slice(5).map(row => row.endpoint as string)
  if (extra.length) await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', extra)
}

export async function removePushSubscription(userId: string, body: unknown) {
  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint
  if (typeof endpoint !== 'string') return
  await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
}

async function push(endpoint: string, keys: Keys) {
  const audience = new URL(endpoint).origin
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '3600', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${vapidToken(audience, keys.privateKey)}, k=${keys.publicKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  // Gone (unsubscribed, app removed): forget it.
  if (response.status === 404 || response.status === 410) {
    await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } else if (!response.ok) {
    console.error(JSON.stringify({ event: 'push.failed', status: response.status, host: new URL(endpoint).hostname }))
  }
}

// After a picture is finished or failed: once the whole try is done, one
// notification to the customer's devices. Never throws.
export async function notifyTryReady(batchId: string, userId: string) {
  try {
    const { count, error } = await supabaseAdmin.from('looks').select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId).in('status', ['QUEUED', 'PROCESSING'])
    if (error || (count ?? 0) > 0) return
    const { data: subscriptions } = await supabaseAdmin.from('push_subscriptions').select('endpoint').eq('user_id', userId)
    if (!subscriptions?.length) return
    // Only one run sends it (two pictures can finish at the same moment).
    const { data: claimed } = await supabaseAdmin.from('try_on_batches').update({ ready_notified_at: new Date().toISOString() })
      .eq('id', batchId).is('ready_notified_at', null).select('id').maybeSingle()
    if (!claimed) return
    const keys = await vapidKeys()
    await Promise.all(subscriptions.map(row => push(row.endpoint as string, keys).catch(error => {
      console.error(JSON.stringify({ event: 'push.failed', message: error instanceof Error ? error.message : String(error) }))
    })))
  } catch (error) {
    console.error(JSON.stringify({ event: 'push.notify_failed', message: error instanceof Error ? error.message : String(error) }))
  }
}
