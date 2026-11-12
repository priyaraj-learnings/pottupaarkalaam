'use client'

import { setLanguage, useLanguage } from '@/lib/client/language'
import type { Language } from '@/lib/legal'

const OPTIONS: Array<{ language: Language; label: string }> = [
  { language: 'en', label: 'English' },
  { language: 'ta', label: 'தமிழ்' },
]

export function LanguageSwitch({ className = '' }: { className?: string }) {
  const language = useLanguage()
  return (
    <div role="radiogroup" aria-label="Language / மொழி" className={`inline-grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1 ${className}`}>
      {OPTIONS.map(option => (
        <button
          key={option.language}
          type="button"
          role="radio"
          aria-checked={language === option.language}
          lang={option.language}
          onClick={() => setLanguage(option.language)}
          className={`min-h-9 rounded-full px-4 text-sm font-extrabold transition ${language === option.language ? 'bg-white text-brand-800 shadow-sm ring-1 ring-brand-200' : 'text-stone-600'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// A small pill for the app headers: shows the other language and switches to it.
export function LanguageToggle({ className = '' }: { className?: string }) {
  const language = useLanguage()
  const next: Language = language === 'ta' ? 'en' : 'ta'
  return (
    <button
      type="button"
      aria-label={next === 'ta' ? 'தமிழில் பார்க்க (Language / மொழி)' : 'View in English (Language / மொழி)'}
      title={next === 'ta' ? 'தமிழ்' : 'English'}
      lang={next}
      onClick={() => setLanguage(next)}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-brand-700 shadow-sm ring-1 ring-brand-200 ${className}`}
    >
      {next === 'ta' ? 'அ' : 'A'}
    </button>
  )
}
