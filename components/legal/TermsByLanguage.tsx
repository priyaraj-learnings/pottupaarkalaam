'use client'

import { LanguageSwitch } from '@/components/LanguageSwitch'
import { TermsContent } from '@/components/legal/TermsContent'
import { TermsContentTa } from '@/components/legal/TermsContentTa'
import { useLanguage } from '@/lib/client/language'

// The Terms of Use page (/terms) in English or Tamil.
export function TermsByLanguage() {
  const language = useLanguage()
  return (
    <>
      <LanguageSwitch className="mb-4" />
      <div lang={language}>{language === 'ta' ? <TermsContentTa /> : <TermsContent />}</div>
    </>
  )
}
