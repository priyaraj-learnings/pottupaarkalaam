'use client'

import { useEffect } from 'react'

import { LEGAL_TEXT } from '@/components/legal/styles'
import { PrivacyContent } from '@/components/legal/PrivacyContent'
import { TermsContent } from '@/components/legal/TermsContent'
import { TERMS_EFFECTIVE } from '@/lib/legal'

export type LegalDoc = 'terms' | 'privacy'

const TITLES: Record<LegalDoc, string> = { terms: 'Terms of Use', privacy: 'Privacy Policy' }

// The Terms or Privacy Policy over the app, so going back returns to exactly
// where the person was (photos added, box ticked). The phone's back button
// closes it too.
export function LegalOverlay({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  useEffect(() => {
    if (!doc) return
    window.history.pushState({ ppLegal: doc }, '')
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [doc, onClose])

  if (!doc) return null
  const back = () => window.history.back()

  return (
    <div role="dialog" aria-modal="true" aria-label={TITLES[doc]} className="fixed inset-0 z-[60] overflow-y-auto bg-ivory">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-ivory/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <button type="button" onClick={back} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-bold text-brand-700 ring-1 ring-brand-200">
            <span aria-hidden="true">←</span> Back
          </button>
          <span className="truncate font-extrabold">{TITLES[doc]}</span>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-5 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-5">
        <p className="text-sm text-stone-500">Effective {TERMS_EFFECTIVE}</p>
        <div className={`mt-4 ${LEGAL_TEXT}`}>
          {doc === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>
        <button type="button" onClick={back} className="mt-10 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 font-bold text-brand-700 ring-1 ring-brand-200">
          <span aria-hidden="true">←</span> Back
        </button>
      </div>
    </div>
  )
}
