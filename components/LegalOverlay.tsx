'use client'

import { useEffect } from 'react'

import { LanguageSwitch } from '@/components/LanguageSwitch'
import { PrivacyContent } from '@/components/legal/PrivacyContent'
import { PrivacyContentTa } from '@/components/legal/PrivacyContentTa'
import { LEGAL_TEXT } from '@/components/legal/styles'
import { TermsContent } from '@/components/legal/TermsContent'
import { useLanguage } from '@/lib/client/language'
import { CONSENT_SCREEN, TERMS_EFFECTIVE } from '@/lib/legal'

export type LegalDoc = 'terms' | 'privacy'

const TITLES: Record<LegalDoc, string> = { terms: 'Terms of Use', privacy: 'Privacy Policy' }
const TAMIL_TITLES: Record<LegalDoc, string> = { terms: 'Terms of Use', privacy: 'தனியுரிமைக் கொள்கை' }

// The Terms or Privacy Policy over the app, so going back returns to exactly
// where the person was (photos added, box ticked). The phone's back button
// closes it too.
export function LegalOverlay({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  const language = useLanguage()
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
          <span className="min-w-0 flex-1 truncate font-extrabold">{(language === 'ta' ? TAMIL_TITLES : TITLES)[doc]}</span>
          <LanguageSwitch className="shrink-0" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-5 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-5">
        <p className="text-sm text-stone-500">Effective {TERMS_EFFECTIVE}</p>
        {doc === 'terms' && language === 'ta' && <p lang="ta" className="mt-3 rounded-xl bg-marigold-50 p-3 text-sm text-marigold-900">{CONSENT_SCREEN.ta.termsEnglishOnly}</p>}
        <div className={`mt-4 ${LEGAL_TEXT}`} lang={doc === 'privacy' ? language : 'en'}>
          {doc === 'terms' ? <TermsContent /> : language === 'ta' ? <PrivacyContentTa /> : <PrivacyContent />}
        </div>
        <button type="button" onClick={back} className="mt-10 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 font-bold text-brand-700 ring-1 ring-brand-200">
          <span aria-hidden="true">←</span> Back
        </button>
      </div>
    </div>
  )
}
