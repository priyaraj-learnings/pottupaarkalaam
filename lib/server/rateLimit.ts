import 'server-only'

import { clientIpFromHeaders } from '@/lib/server/clientIp'
import { ApiError } from '@/lib/server/http'

// A simple per-address limit for routes anyone can call without signing in
// (visit counts, mobile sign-in, unsubscribe). Kept in each server's memory:
// with several servers the limit is per server, which is enough to stop one
// address flooding a route. Big attacks are for Cloud Armor.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 20_000

export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()) {
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [old, value] of buckets) if (value.resetAt <= now) buckets.delete(old)
      if (buckets.size >= MAX_KEYS) buckets.clear()
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

// Throws 429 when this address made more than `limit` calls to `route` in the window.
export function limitByAddress(request: Request, route: string, limit: number, windowMs = 60_000) {
  const address = clientIpFromHeaders(request.headers) || 'unknown'
  if (!allowRequest(`${route}:${address}`, limit, windowMs)) {
    throw new ApiError(429, 'TOO_MANY_REQUESTS', 'Too many tries. Please wait a minute and try again.')
  }
}

export function resetRateLimits() {
  buckets.clear()
}
