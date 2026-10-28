'use client'

import { useRouter } from 'next/navigation'

// Back to where the person came from in the app (the account menu, the terms
// card), or to the app itself when the page was opened directly.
export function BackButton({ className = '' }: { className?: string }) {
  const router = useRouter()
  function back() {
    const cameFromApp = document.referrer.startsWith(window.location.origin) && window.history.length > 1
    if (cameFromApp) router.back()
    else router.push('/')
  }
  return (
    <button type="button" onClick={back} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-bold text-brand-700 ring-1 ring-brand-200 ${className}`}>
      <span aria-hidden="true">←</span> Back
    </button>
  )
}
