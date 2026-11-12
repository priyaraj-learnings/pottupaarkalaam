'use client'

import { useCallback, useSyncExternalStore } from 'react'

import type { Language } from '@/lib/legal'

// English or Tamil for the consent screen and the Privacy Policy, remembered on
// this phone. Every screen that reads it updates together.
const KEY = 'pp-lang'
const listeners = new Set<() => void>()

function read(): Language {
  try {
    return localStorage.getItem(KEY) === 'ta' ? 'ta' : 'en'
  } catch {
    return 'en'
  }
}

export function setLanguage(language: Language) {
  try {
    localStorage.setItem(KEY, language)
  } catch {
    // Private mode: just not remembered.
  }
  listeners.forEach(listener => listener())
  // Phone notifications (public/sw.js) use the same language.
  if ('caches' in window) caches.open('pp-settings').then(cache => cache.put('/__pp-lang', new Response(language))).catch(() => undefined)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, read, () => 'en')
}

// The words in the chosen language: t('Try on', 'முயற்சி செய்'). Every
// customer screen uses it, so the English / தமிழ் switch changes the whole app.
export type Translate = (en: string, ta: string) => string

export function useT(): Translate {
  const language = useLanguage()
  return useCallback((en: string, ta: string) => (language === 'ta' ? ta : en), [language])
}

// Outside React (share messages, page title): the language saved on this phone.
export function tr(en: string, ta: string) {
  return typeof window !== 'undefined' && read() === 'ta' ? ta : en
}
