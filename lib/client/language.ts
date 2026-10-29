'use client'

import { useSyncExternalStore } from 'react'

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
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, read, () => 'en')
}
