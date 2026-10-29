'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui'

// Chrome's install prompt, held until the person taps "Install app".
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let held: InstallPrompt | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    held = event as InstallPrompt
    listeners.forEach(listener => listener())
  })
  window.addEventListener('appinstalled', () => {
    held = null
    listeners.forEach(listener => listener())
  })
}

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

const isIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

// What this phone can do: install with one tap (Android Chrome), follow the
// Share → Add to Home Screen steps (iPhone), or nothing (already installed, or
// a browser that cannot install).
function useInstall() {
  const [state, setState] = useState<'none' | 'prompt' | 'iphone'>('none')
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    const update = () => setState(standalone() ? 'none' : held ? 'prompt' : isIphone() ? 'iphone' : 'none')
    const timer = setTimeout(update, 0)
    listeners.add(update)
    return () => {
      clearTimeout(timer)
      listeners.delete(update)
    }
  }, [])
  return state
}

async function install() {
  if (!held) return
  const prompt = held
  held = null
  await prompt.prompt()
  await prompt.userChoice.catch(() => null)
  listeners.forEach(listener => listener())
}

// "Install app": the website becomes an app on the home screen (full screen,
// its own icon), with no Play Store needed.
export function InstallApp({ className = '' }: { className?: string }) {
  const state = useInstall()
  const [showSteps, setShowSteps] = useState(false)
  if (state === 'none') return null
  return (
    <div className={`rounded-2xl bg-marigold-50 p-3 ring-1 ring-marigold-200 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">📲</span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-marigold-900">Put PottuPaarkalaam on your home screen, like any app.</p>
        <Button variant="secondary" onClick={() => (state === 'prompt' ? void install() : setShowSteps(value => !value))} className="min-h-10 shrink-0 text-sm">
          Install app
        </Button>
      </div>
      {state === 'iphone' && showSteps && (
        <p className="mt-2 text-sm text-marigold-900">In Safari, tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.</p>
      )}
    </div>
  )
}
