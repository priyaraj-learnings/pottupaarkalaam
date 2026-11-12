'use client'

import { api } from '@/lib/client/api'
import { tr, type Translate } from '@/lib/client/language'
import type { Language } from '@/lib/legal'

// "Tell me when it's ready": a phone notification when a try is finished
// (lib/server/push.ts, public/sw.js). iPhones allow it only for the installed
// app (Add to Home Screen).

export type PushState = 'on' | 'off' | 'denied' | 'unsupported'

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function pushSupported() {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  return !/iphone|ipad|ipod/i.test(navigator.userAgent) || standalone()
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js')
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const subscription = await (await registration()).pushManager.getSubscription().catch(() => null)
  return subscription && Notification.permission === 'granted' ? 'on' : 'off'
}

// The service worker shows the notification in the chosen language.
export async function saveLanguageForNotifications(language: Language) {
  try {
    if (!('caches' in window)) return
    const cache = await caches.open('pp-settings')
    await cache.put('/__pp-lang', new Response(language))
  } catch {
    // Then it is in English.
  }
}

const keyBytes = (base64url: string) => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

// Asks the phone's permission (only from a tap) and saves the subscription.
export async function enablePush(t: Translate = tr): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const { publicKey } = await api<{ publicKey: string }>('/api/me/push')
  const worker = await registration()
  await navigator.serviceWorker.ready
  const subscription = (await worker.pushManager.getSubscription())
    ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  await api('/api/me/push', { method: 'POST', json: { endpoint: subscription.endpoint } })
  await saveLanguageForNotifications(t('en', 'ta') as Language)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const subscription = await (await registration()).pushManager.getSubscription()
  if (subscription) {
    await api('/api/me/push', { method: 'DELETE', json: { endpoint: subscription.endpoint } }).catch(() => undefined)
    await subscription.unsubscribe().catch(() => undefined)
  }
  return 'off'
}
