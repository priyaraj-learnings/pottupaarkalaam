'use client'

// Refer a friend, in the browser.
//
// A visitor who opens an invite link (pp.inaivuit.com/?ref=CODE) has the code
// remembered here (30 days) until they sign in; the app then sends it once to
// /api/me/referral. The signed-in customer's own code is kept too, so pictures
// they share carry their invite link.

import { tr } from '@/lib/client/language'

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
    ? tr(`I tried this on with PottuPaarkalaam 😍 See how sarees, blouses and dhotis look on you before you buy. Join with my link and we both get 2 free pictures: ${inviteUrl(code)}`,
      `PottuPaarkalaam-இல் இதை அணிந்து பார்த்தேன் 😍 புடவை, ரவிக்கை, வேஷ்டி வாங்கும் முன் உங்களுக்கு எப்படி இருக்கும் என்று பாருங்கள். என் இணைப்பில் சேர்ந்தால் நம் இருவருக்கும் 2 இலவசப் படங்கள்: ${inviteUrl(code)}`)
    : tr(`I tried this on with PottuPaarkalaam 😍 See how sarees, blouses and dhotis look on you before you buy: ${inviteUrl(null)}`,
      `PottuPaarkalaam-இல் இதை அணிந்து பார்த்தேன் 😍 புடவை, ரவிக்கை, வேஷ்டி வாங்கும் முன் உங்களுக்கு எப்படி இருக்கும் என்று பாருங்கள்: ${inviteUrl(null)}`)
}

// "Help me choose" (the numbered collage).
export function voteMessage(count: number, code: string | null = myInviteCode()) {
  const numbers = Array.from({ length: count }, (_, index) => index + 1)
  const options = `${numbers.slice(0, -1).join(', ')} ${tr('or', 'அல்லது')} ${numbers[numbers.length - 1]}`
  const link = inviteUrl(code)
  return tr(`Help me choose! Which one suits me best? Reply ${options} 🙏\n\nMade with PottuPaarkalaam: see clothes on you before you buy. ${link}`,
    `எதைத் தேர்ந்தெடுப்பது என்று சொல்லுங்கள்! எனக்கு எது நன்றாக இருக்கிறது? ${options} என்று பதில் அனுப்புங்கள் 🙏\n\nPottuPaarkalaam மூலம் உருவாக்கியது: வாங்கும் முன் உடையை உங்கள் மேல் பாருங்கள். ${link}`)
}

export const whatsAppLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
