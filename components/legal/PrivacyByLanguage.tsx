'use client'

import { LanguageSwitch } from '@/components/LanguageSwitch'
import { PrivacyContent } from '@/components/legal/PrivacyContent'
import { PrivacyContentTa } from '@/components/legal/PrivacyContentTa'
import { useLanguage } from '@/lib/client/language'

// The Privacy Policy page (/privacy) in English or Tamil.
export function PrivacyByLanguage() {
  const language = useLanguage()
  return (
    <>
      <LanguageSwitch className="mb-4" />
      <div lang={language}>{language === 'ta' ? <PrivacyContentTa /> : <PrivacyContent />}</div>
    </>
  )
}
