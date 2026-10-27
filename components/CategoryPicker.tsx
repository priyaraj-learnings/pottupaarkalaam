'use client'

import { GARMENT_CATEGORIES, SOURCE_LABELS, type GarmentSource } from '@/lib/rules'

const GROUPS = [
  { group: 'WOMEN', label: 'For women' },
  { group: 'MEN', label: 'For men' },
] as const

const SOURCE_HELP: Record<GarmentSource, { icon: string; help: string }> = {
  FABRIC: { icon: '🧵', help: 'Cloth not yet stitched. We show it stitched.' },
  STITCHED: { icon: '👗', help: 'A ready-made dress. We put it on you.' },
}

export function CategoryChips({ value, onChange }: { value: string | null; onChange: (code: string) => void }) {
  return (
    <div className="space-y-3">
      {GROUPS.map(({ group, label }) => (
        <div key={group}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p>
          <div className="flex flex-wrap gap-2">
            {GARMENT_CATEGORIES.filter(category => category.group === group).map(category => {
              const selected = category.code === value
              return (
                <button
                  key={category.code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(category.code)}
                  className={`min-h-10 rounded-full px-4 text-sm font-bold transition ${selected ? 'brand-gradient text-white shadow' : 'bg-stone-100 text-stone-800 active:bg-stone-200'}`}
                >
                  {category.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
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
