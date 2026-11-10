'use client'

// Refer a friend, in the browser.
//
// A visitor who opens an invite link (pp.inaivuit.com/?ref=CODE) has the code
// remembered here (30 days) until they sign in; the app then sends it once to
// /api/me/referral. The signed-in customer's own code is kept too, so pictures
// they share carry their invite link.

const PENDING = 'pp-ref'
const MINE = 'pp-my-ref'
const KEEP_MS = 30 * 86_400_000
const CODE = /^[0-9A-F]{8}$/

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Private mode: the invite only lasts this visit.
  }
}

// On page load: takes ?ref=CODE out of the address and remembers it.
export function captureReferral() {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const code = url.searchParams.get('ref')?.trim().toUpperCase() ?? ''
  if (!url.searchParams.has('ref')) return pendingReferral()
  url.searchParams.delete('ref')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  if (!CODE.test(code) || code === myInviteCode()) return pendingReferral()
  write(PENDING, JSON.stringify({ code, at: Date.now() }))
  return code
}

export function pendingReferral(): string | null {
  const saved = read(PENDING)
  if (!saved) return null
  try {
    const { code, at } = JSON.parse(saved) as { code?: unknown; at?: unknown }
    if (typeof code === 'string' && CODE.test(code) && typeof at === 'number' && Date.now() - at < KEEP_MS) return code
  } catch {
    // Fall through: forget it.
  }
  write(PENDING, null)
  return null
}

export const clearPendingReferral = () => write(PENDING, null)

export function rememberMyInviteCode(code: string | null | undefined) {
  if (code && CODE.test(code)) write(MINE, code)
}

export function myInviteCode() {
  const code = read(MINE)
  return code && CODE.test(code) ? code : null
}

export function inviteUrl(code: string | null = myInviteCode()) {
  const origin = typeof window === 'undefined' ? 'https://pp.inaivuit.com' : window.location.origin
  return code ? `${origin}/?ref=${code}` : origin
}

// The words that go with a shared picture or an invite.
export function shareMessage(code: string | null = myInviteCode()) {
  return code
    ? `I tried this on with PottuPaarkalaam 😍 See how sarees, blouses and dhotis look on you before you buy. Join with my link and we both get 2 free pictures: ${inviteUrl(code)}`
    : `I tried this on with PottuPaarkalaam 😍 See how sarees, blouses and dhotis look on you before you buy: ${inviteUrl(null)}`
}

export const whatsAppLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
