import type { NextConfig } from 'next'

const isUat = process.env.NEXT_PUBLIC_APP_ENV === 'uat'

// Applied to every response. The CSP only restricts framing, plugins, <base>
// and form targets, so it cannot break Next.js or Supabase sign-in.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  deploymentId: process.env.APP_RELEASE_ID || undefined,
  poweredByHeader: false,
  async headers() {
    const headers = [...securityHeaders]
    if (isUat) headers.push({ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, noimageindex' })
    return [
      { source: '/:path*', headers },
      // Pages are prerendered, so Next.js marks them cacheable for a year
      // (s-maxage). Firebase Hosting's CDN in front of production would then
      // keep serving the old pages after every release. Browsers and the CDN
      // check for a new version instead; /_next/static files keep their
      // long cache (their names change with every build).
      { source: '/((?!_next/static|_next/image|api/).*)', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ]
  },
}

export default nextConfig
