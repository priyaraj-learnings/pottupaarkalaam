'use client'

import { useEffect, useState } from 'react'

import { useT } from '@/lib/client/language'

export type SampleModel = { id: string; url: string; label: string; gender: 'WOMAN' | 'MAN' }

let loaded: Promise<SampleModel[]> | null = null

// The admin's sample models (public; asked once per visit).
export function useSampleModels() {
  const [models, setModels] = useState<SampleModel[]>([])
  useEffect(() => {
    let cancelled = false
    loaded ??= fetch('/api/sample-models').then(response => (response.ok ? response.json() : { models: [] }))
      .then(result => (Array.isArray(result.models) ? result.models as SampleModel[] : []))
      .catch(() => [])
    loaded.then(list => { if (!cancelled) setModels(list) })
    return () => { cancelled = true }
  }, [])
  return models
}

// "No photo handy? Try it on a model first": a row of sample models.
export function SampleModelPicker({ chosen, onPick, disabled }: { chosen: string | null; onPick: (model: SampleModel) => void; disabled?: boolean }) {
  const t = useT()
  const models = useSampleModels()
  if (!models.length) return null
  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <p className="mb-2 text-sm font-bold text-stone-700">{t('No photo handy? Try it on a model first', 'புகைப்படம் இல்லையா? முதலில் ஒரு மாடலிடம் அணிந்து பாருங்கள்')}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {models.map(model => (
          <button key={model.id} type="button" disabled={disabled} onClick={() => onPick(model)} aria-pressed={chosen === model.id}
            className={`w-16 shrink-0 text-center disabled:opacity-50 ${chosen === model.id ? 'font-extrabold text-brand-700' : 'text-stone-600'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={model.url} alt="" className={`h-24 w-16 rounded-xl object-cover ring-2 ${chosen === model.id ? 'ring-brand-600' : 'ring-stone-200'}`} />
            <span className="mt-1 block truncate text-[11px]">{model.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-stone-500">{t('Like it? Then add your own photo and see it on you.', 'பிடித்திருக்கிறதா? பிறகு உங்கள் புகைப்படத்தைச் சேர்த்து உங்கள் மேல் பாருங்கள்.')}</p>
    </div>
  )
}
