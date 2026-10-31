'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Recharge } from '@/components/admin/types'

// =======================================================
// NEW-RECHARGE ALERTS (/admin)
//
// The admin page re-checks every 30 seconds. When a recharge
// appears that needs checking, this beeps, shows a phone /
// desktop notification and puts the count in the tab title,
// while the admin page is open (also in a background tab).
// Browsers only allow sound after a tap, so alerts are
// switched on with a button; the choice is remembered on
// this device.
// =======================================================

const STORAGE_KEY = 'pp-admin-recharge-alerts'

function readOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function saveOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Private mode: on for this visit only.
  }
}

// Two short rising tones, made in the browser (no sound file).
function beep(context: AudioContext) {
  const start = context.currentTime + 0.02
  for (const [offset, frequency] of [[0, 880], [0.22, 1320]] as const) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start + offset)
    oscillator.stop(start + offset + 0.2)
  }
}

export function newRechargeIds(seen: ReadonlySet<string>, pending: ReadonlyArray<Pick<Recharge, 'id'>>) {
  return pending.filter(recharge => !seen.has(recharge.id)).map(recharge => recharge.id)
}

export function useRechargeAlerts(pending: Recharge[] | undefined, onOpen: () => void) {
  const [on, setOn] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  // Recharges already known: null until the first load (no alert for those).
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setOn(readOn()), 0)
    return () => clearTimeout(timer)
  }, [])

  const alert = useCallback((count: number, amountInr: number) => {
    if (!audio.current) audio.current = new AudioContext()
    if (audio.current.state === 'suspended') void audio.current.resume()
    beep(audio.current)
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('PottuPaarkalaam: recharge to check', {
        body: count === 1 ? `₹${amountInr.toLocaleString('en-IN')} is waiting for you to approve.` : `${count} recharges are waiting for you to approve.`,
        tag: 'pp-recharge',
      })
      notification.onclick = () => {
        window.focus()
        onOpen()
        notification.close()
      }
    }
  }, [onOpen])

  useEffect(() => {
    if (!pending) return
    if (!seen.current) {
      seen.current = new Set(pending.map(recharge => recharge.id))
      return
    }
    const fresh = newRechargeIds(seen.current, pending)
    for (const id of fresh) seen.current.add(id)
    if (fresh.length && on) {
      const amount = pending.find(recharge => recharge.id === fresh[0])?.amount_inr ?? 0
      alert(fresh.length, amount)
    }
  }, [pending, on, alert])

  // The count in the tab title, so it shows on a background tab too.
  const waiting = pending?.length ?? 0
  useEffect(() => {
    const base = 'PottuPaarkalaam admin'
    document.title = waiting ? `(${waiting}) Recharge to check · ${base}` : base
  }, [waiting])

  const toggle = useCallback(async () => {
    const next = !on
    setOn(next)
    saveOn(next)
    if (!next) return
    // This tap unlocks sound; a test beep shows it works.
    if (!audio.current) audio.current = new AudioContext()
    await audio.current.resume().catch(() => undefined)
    beep(audio.current)
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => undefined)
    }
  }, [on])

  return { on, toggle }
}

export function AlertsButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={on ? 'Beep and notify when a recharge needs checking (while this page is open)' : 'Turn on a beep and notification for new recharges'}
      className={`rounded-full px-3 py-1 text-xs font-bold ${on ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300' : 'bg-white text-stone-700 ring-1 ring-stone-300'}`}
    >
      {on ? '🔔 Alerts on' : '🔕 Turn on alerts'}
    </button>
  )
}
