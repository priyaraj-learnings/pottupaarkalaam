'use client'

import { useT } from '@/lib/client/language'

// The occasion backgrounds (lib/prompts.ts BACKGROUNDS); '' keeps the photo's own.
const OPTIONS: Array<{ id: string; icon: string; en: string; ta: string }> = [
  { id: '', icon: '📷', en: 'My photo', ta: 'என் புகைப்படம்' },
  { id: 'WEDDING', icon: '💐', en: 'Wedding hall', ta: 'திருமண மண்டபம்' },
  { id: 'TEMPLE', icon: '🛕', en: 'Temple', ta: 'கோயில்' },
  { id: 'DEEPAVALI', icon: '🪔', en: 'Deepavali', ta: 'தீபாவளி' },
  { id: 'PONGAL', icon: '🌾', en: 'Pongal', ta: 'பொங்கல்' },
  { id: 'GARDEN', icon: '🌳', en: 'Garden', ta: 'தோட்டம்' },
  { id: 'STUDIO', icon: '⬜', en: 'Studio', ta: 'ஸ்டுடியோ' },
]

export function BackgroundPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT()
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-stone-700">{t('Background (optional)', 'பின்னணி (விருப்பம்)')}</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(option => (
          <button key={option.id || 'own'} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${value === option.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-stone-700 ring-stone-300'}`}>
            <span aria-hidden="true">{option.icon}</span> {t(option.en, option.ta)}
          </button>
        ))}
      </div>
    </div>
  )
}
