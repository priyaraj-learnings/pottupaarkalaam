import 'server-only'

import { BlockList, isIP } from 'node:net'

// =======================================================
// CLIENT IP FROM X-FORWARDED-FOR
//
// Production runs on Cloud Run. Google Front End (GFE)
// always APPENDS the address of whoever connected to it as
// the right-most X-Forwarded-For entry; anything to the
// left of that came from the caller and can be forged.
//
// * Direct to *.run.app: the right-most entry is the client.
// * Through Firebase Hosting: Firebase Hosting (its Fastly
//   CDN) appends the client, then GFE appends the Firebase
//   edge address. So: "<forged...>, client, firebase-edge".
//
// We therefore walk from the right and skip only entries
// that are our own proxies (Firebase Hosting / Fastly edge
// ranges and private / loopback addresses). The first entry
// that is not a trusted proxy is the client. A caller can
// add entries on the left, but never on the right.
//
// Extra trusted proxy ranges can be added, comma-separated,
// in TRUSTED_PROXY_CIDRS (e.g. "203.0.113.0/24,2001:db8::/32").
// =======================================================

// Fastly public edge ranges (https://api.fastly.com/public-ip-list),
// used by Firebase Hosting, plus private / loopback / link-local.
const DEFAULT_TRUSTED_PROXY_CIDRS = [
  '23.235.32.0/20', '43.249.72.0/22', '103.244.50.0/24', '103.245.222.0/23',
  '103.245.224.0/24', '104.156.80.0/20', '140.248.64.0/18', '140.248.128.0/17',
  '146.75.0.0/17', '151.101.0.0/16', '157.52.64.0/18', '167.82.0.0/17',
  '167.82.128.0/20', '167.82.160.0/20', '167.82.224.0/20', '172.111.64.0/18',
  '185.31.16.0/22', '199.27.72.0/21', '199.232.0.0/16',
  '2a04:4e40::/32', '2a04:4e42::/32',
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16',
  '::1/128', 'fc00::/7', 'fe80::/10',
]

function buildTrustedProxies(extra: string | undefined) {
  const list = new BlockList()
  const cidrs = [...DEFAULT_TRUSTED_PROXY_CIDRS, ...(extra ?? '').split(',')]
  for (const raw of cidrs) {
    const [address, prefix] = raw.trim().split('/')
    const family = isIP(address ?? '')
    const bits = Number(prefix)
    if (!family || !Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128)) continue
    list.addSubnet(address, bits, family === 4 ? 'ipv4' : 'ipv6')
  }
  return list
}

let cached: { extra: string | undefined; list: BlockList } | null = null

function trustedProxies() {
  const extra = process.env.TRUSTED_PROXY_CIDRS
  if (!cached || cached.extra !== extra) cached = { extra, list: buildTrustedProxies(extra) }
  return cached.list
}

function normalize(entry: string) {
  let value = entry.trim()
  // "[2001:db8::1]" or "[2001:db8::1]:443"
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed) value = bracketed[1]
  // "203.0.113.9:443"
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(':'))
  const lower = value.toLowerCase()
  if (lower.startsWith('::ffff:') && isIP(lower.slice(7)) === 4) value = lower.slice(7)
  const family = isIP(value)
  return family ? { address: value.toLowerCase(), family: family === 4 ? 'ipv4' as const : 'ipv6' as const } : null
}

// The client's address (for counting visitors), or 'unknown' when there is no
// usable X-Forwarded-For (local development). X-Real-IP is not used: on
// Cloud Run it is not set by the platform, so it would be caller-controlled.
export function clientIpFromHeaders(headers: Headers): string {
  const entries = (headers.get('x-forwarded-for') ?? '').split(',').map(entry => entry.trim()).filter(Boolean)
  const proxies = trustedProxies()
  let lastTrusted: string | null = null
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const parsed = normalize(entries[index])
    // Garbage to the left of our proxies was written by the caller: stop at
    // the last address a trusted hop vouched for.
    if (!parsed) return lastTrusted ?? 'unknown'
    if (!proxies.check(parsed.address, parsed.family)) return parsed.address
    lastTrusted = parsed.address
  }
  return lastTrusted ?? 'unknown'
}
