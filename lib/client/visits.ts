'use client'

// "Started a try-on" for the /admin funnel (lib/server/visits.ts): counted
// once per page load, when the first photo is added. No cookies.
let started = false

export function countTryOnStart() {
  if (started || typeof window === 'undefined' || navigator.webdriver) return
  started = true
  fetch('/api/visit/start', { method: 'POST', keepalive: true }).catch(() => undefined)
}
