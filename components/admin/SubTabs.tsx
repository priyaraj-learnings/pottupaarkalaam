'use client'

import { useEffect, useState } from 'react'

// Sub-tabs inside an /admin tab (Overview, Payments, Settings), so a long page
// shows one part at a time. The choice is remembered for this visit.
export type SubTab<T extends string> = { id: T; label: string; badge?: number }

export function useSubTab<T extends string>(storageKey: string, tabs: ReadonlyArray<SubTab<T>>): [T, (id: T) => void] {
  const [active, setActive] = useState<T>(tabs[0].id)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(storageKey) as T | null
        if (saved && tabs.some(tab => tab.id === saved)) setActive(saved)
      } catch {
        // Private mode: start on the first sub-tab.
      }
    }, 0)
    return () => clearTimeout(timer)
    // The tab list is fixed for each page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  const choose = (id: T) => {
    setActive(id)
    try {
      sessionStorage.setItem(storageKey, id)
    } catch {
      // Not remembered.
    }
  }
  return [active, choose]
}

export function SubTabs<T extends string>({ tabs, active, onChange, label }: {
  tabs: ReadonlyArray<SubTab<T>>
  active: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-2xl bg-stone-100 p-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold ${active === tab.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`}
        >
          {tab.label}
          {Boolean(tab.badge) && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-black text-stone-900">{tab.badge}</span>}
        </button>
      ))}
    </div>
  )
}
