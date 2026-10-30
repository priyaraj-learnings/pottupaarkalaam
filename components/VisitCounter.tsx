'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

// The page last counted in this tab: a page is not counted twice in a row
// (React runs effects twice in development, and re-renders keep the path).
let lastCounted: string | null = null

// Counts a page view (lib/server/visits.ts): no cookies, nothing stored here.
// Not for /admin, or for automated browsers.
export default function VisitCounter() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || pathname === lastCounted || pathname.startsWith('/admin') || navigator.webdriver) return
    lastCounted = pathname
    fetch('/api/visit', { method: 'POST', keepalive: true }).catch(() => undefined)
  }, [pathname])
  return null
}
