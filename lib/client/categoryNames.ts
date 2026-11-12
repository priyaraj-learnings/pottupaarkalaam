'use client'

import { useCallback } from 'react'

import { useLanguage } from '@/lib/client/language'
import { categoryLabel, SOURCE_LABELS, type GarmentSource } from '@/lib/rules'

// Garment names in Tamil, for the screens (the English names in lib/rules.ts
// also go into the AI prompts, so they stay as they are).
const TAMIL: Record<string, string> = {
  SAREE: 'புடவை',
  BLOUSE: 'ரவிக்கை',
  CHUDIDHAR: 'சுடிதார்',
  SALWAR_SUIT: 'சல்வார் சூட்',
  KURTI: 'குர்தி',
  ANARKALI: 'அனார்கலி',
  LEHENGA: 'லெஹங்கா',
  GOWN: 'கவுன்',
  FORMAL_SHIRT: 'சட்டை',
  CASUAL_SHIRT: 'கேஷுவல் சட்டை',
  TROUSER: 'பேண்ட்',
  KURTA: 'குர்தா',
  PYJAMA: 'பைஜாமா',
  DHOTI: 'வேஷ்டி',
  SHERWANI: 'ஷெர்வானி',
  COAT: 'கோட் / பிளேசர்',
  WAISTCOAT: 'நேரு ஜாக்கெட்',
  JACKET: 'ஜாக்கெட்',
  SAFARI: 'சஃபாரி சூட்',
}

const SOURCE_TAMIL: Record<GarmentSource, string> = {
  FABRIC: 'தைக்காத துணி',
  STITCHED: 'தைத்த உடை',
}

// const name = useCategoryName(); name('SAREE') → "Saree" or "புடவை".
export function useCategoryName() {
  const language = useLanguage()
  return useCallback((code: string) => (language === 'ta' ? TAMIL[code] ?? categoryLabel(code) : categoryLabel(code)), [language])
}

export function useSourceName() {
  const language = useLanguage()
  return useCallback((source: GarmentSource) => (language === 'ta' ? SOURCE_TAMIL[source] : SOURCE_LABELS[source]), [language])
}
