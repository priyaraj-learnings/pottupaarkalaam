'use client'

import { useState } from 'react'

import { GARMENT_CATEGORIES, SOURCE_LABELS, type GarmentSource } from '@/lib/rules'

type Group = 'WOMEN' | 'MEN'

const GROUPS: Array<{ group: Group; label: string }> = [
  { group: 'WOMEN', label: 'For women' },
  { group: 'MEN', label: 'For men' },
]

const GROUP_KEY = 'pp-category-group'

const SOURCE_HELP: Record<GarmentSource, { icon: string; help: string }> = {
  FABRIC: { icon: '🧵', help: 'Cloth not yet stitched. We show it stitched.' },
  STITCHED: { icon: '👗', help: 'A ready-made dress. We put it on you.' },
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
export function CategoryChips({ value, onChange }: { value: string | null; onChange: (code: string) => void }) {
  const [group, setGroup] = useState<Group>(() => groupOf(value) ?? savedGroup())

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
      <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1" role="radiogroup" aria-label="Women's or men's clothes">
        {GROUPS.map(option => (
          <button
            key={option.group}
            type="button"
            role="radio"
            aria-checked={group === option.group}
            onClick={() => pickGroup(option.group)}
            className={`min-h-10 rounded-full text-sm font-extrabold transition ${group === option.group ? 'bg-white text-brand-800 shadow-sm ring-1 ring-brand-200' : 'text-stone-600'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {GARMENT_CATEGORIES.filter(category => category.group === group).map(category => {
          const selected = category.code === value
          return (
            <button
              key={category.code}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(category.code)}
              className={`min-h-10 rounded-full px-4 text-sm font-bold transition ${selected ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-500' : 'bg-white text-stone-800 ring-1 ring-stone-200 active:bg-stone-100'}`}
            >
              {category.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SourceToggle({ value, onChange }: { value: GarmentSource; onChange: (source: GarmentSource) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Fabric or dress">
      {(Object.keys(SOURCE_LABELS) as GarmentSource[]).map(source => {
        const selected = source === value
        return (
          <button
            key={source}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(source)}
            className={`rounded-2xl border-2 p-3 text-left transition ${selected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'}`}
          >
            <span className="text-xl" aria-hidden="true">{SOURCE_HELP[source].icon}</span>
            <span className="mt-1 block text-sm font-extrabold">{SOURCE_LABELS[source]}</span>
            <span className="block text-xs text-stone-500">{SOURCE_HELP[source].help}</span>
          </button>
        )
      })}
    </div>
  )
}
