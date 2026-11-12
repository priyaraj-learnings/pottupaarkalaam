'use client'

import { useState } from 'react'

import { useCategoryName, useSourceName } from '@/lib/client/categoryNames'
import { useLanguage, useT } from '@/lib/client/language'
import { fabricOnly, GARMENT_CATEGORIES, OFFERED_CATEGORIES, SOURCE_LABELS, type GarmentSource } from '@/lib/rules'

export type Group = 'WOMEN' | 'MEN'

const GROUPS: Array<{ group: Group; label: string; ta: string }> = [
  { group: 'WOMEN', label: 'For women', ta: 'பெண்களுக்கு' },
  { group: 'MEN', label: 'For men', ta: 'ஆண்களுக்கு' },
]

const GROUP_KEY = 'pp-category-group'

const SOURCE_HELP: Record<GarmentSource, { icon: string; help: string; ta: string }> = {
  FABRIC: { icon: '🧵', help: 'Cloth not yet stitched. We show it stitched.', ta: 'இன்னும் தைக்காத துணி. அதைத் தைத்தது போல் காட்டுவோம்.' },
  STITCHED: { icon: '👗', help: 'A ready-made dress. We put it on you.', ta: 'தயாரான உடை. அதை உங்களுக்கு அணிவித்துக் காட்டுவோம்.' },
}

const groupOf = (code: string | null) => GARMENT_CATEGORIES.find(category => category.code === code)?.group as Group | undefined

function savedGroup(): Group {
  try {
    return localStorage.getItem(GROUP_KEY) === 'MEN' ? 'MEN' : 'WOMEN'
  } catch {
    return 'WOMEN'
  }
}

// Women's or men's clothes (remembered on this phone), then one tap on the
// garment: quicker than a dropdown when adding several garments in a row.
// onlyGroup shows one group's garments without the toggle (couple pictures).
export function CategoryChips({ value, onChange, onlyGroup }: { value: string | null; onChange: (code: string) => void; onlyGroup?: Group }) {
  const [chosenGroup, setGroup] = useState<Group>(() => groupOf(value) ?? savedGroup())
  const group = onlyGroup ?? chosenGroup
  const t = useT()
  const name = useCategoryName()

  function pickGroup(next: Group) {
    setGroup(next)
    try {
      localStorage.setItem(GROUP_KEY, next)
    } catch {
      // Private mode: just not remembered.
    }
  }

  return (
    <div className="space-y-3">
      {!onlyGroup && <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1" role="radiogroup" aria-label={t("Women's or men's clothes", 'பெண்கள் அல்லது ஆண்கள் உடைகள்')}>
        {GROUPS.map(option => (
          <button
            key={option.group}
            type="button"
            role="radio"
            aria-checked={group === option.group}
            onClick={() => pickGroup(option.group)}
            className={`min-h-10 rounded-full text-sm font-extrabold transition ${group === option.group ? 'bg-white text-brand-800 shadow-sm ring-1 ring-brand-200' : 'text-stone-600'}`}
          >
            {t(option.label, option.ta)}
          </button>
        ))}
      </div>}
      <div className="flex flex-wrap gap-2">
        {OFFERED_CATEGORIES.filter(category => category.group === group).map(category => {
          const selected = category.code === value
          return (
            <button
              key={category.code}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(category.code)}
              className={`min-h-10 rounded-full px-4 text-sm font-bold transition ${selected ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-500' : 'bg-white text-stone-800 ring-1 ring-stone-200 active:bg-stone-100'}`}
            >
              {name(category.code)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// For a saree or veshti (category), "Stitched dress" is off and fabric chosen.
export function SourceToggle({ value, onChange, category }: {
  value: GarmentSource
  onChange: (source: GarmentSource) => void
  category?: string | null
}) {
  const onlyFabric = fabricOnly(category)
  const t = useT()
  const ta = useLanguage() === 'ta'
  const name = useCategoryName()
  const sourceName = useSourceName()
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Fabric or dress', 'துணி அல்லது உடை')}>
      {(Object.keys(SOURCE_LABELS) as GarmentSource[]).map(source => {
        const disabled = onlyFabric && source === 'STITCHED'
        const selected = onlyFabric ? source === 'FABRIC' : source === value
        return (
          <button
            key={source}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(source)}
            className={`rounded-2xl border-2 p-3 text-left transition ${selected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'} ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
          >
            <span className="text-xl" aria-hidden="true">{SOURCE_HELP[source].icon}</span>
            <span className="mt-1 block text-sm font-extrabold">{sourceName(source)}</span>
            <span className="block text-xs text-stone-500">
              {disabled
                ? t(`A ${name(category ?? '').toLowerCase()} is always unstitched cloth.`, `${name(category ?? '')} எப்போதும் தைக்காத துணிதான்.`)
                : ta ? SOURCE_HELP[source].ta : SOURCE_HELP[source].help}
            </span>
          </button>
        )
      })}
    </div>
  )
}
