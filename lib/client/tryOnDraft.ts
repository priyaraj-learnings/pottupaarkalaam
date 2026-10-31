'use client'

import type { GarmentSource } from '@/lib/rules'

// =======================================================
// A TRY-ON STARTED BEFORE SIGNING IN
//
// A visitor chooses the clothes and takes the photos without an
// account. At "Try on" they are kept on this phone only (the
// browser's IndexedDB: nothing is uploaded) while they sign in,
// which for Google leaves the page and comes back. After
// sign-in and the terms, the try-on screen takes them back and
// makes the picture. Kept at most a day; removed once used.
// =======================================================

export type TryOnDraft = {
  category: string | null
  source: GarmentSource
  items: Array<{ blob: Blob; category: string; source: GarmentSource }>
  // Pairs as positions in items.
  pairs: Array<[number, number]>
  photo: Blob
  savedAt: number
}

const DB = 'pp-try-on'
const STORE = 'draft'
const KEY = 'current'
export const DRAFT_MAX_AGE_MS = 24 * 3_600_000

// When IndexedDB is not there (some private modes): this page only, which
// still covers signing in with a mobile number or email.
let memory: TryOnDraft | null = null

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const request = indexedDB.open(DB, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open()
  if (!db) return null
  return new Promise(resolve => {
    try {
      const request = work(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => { resolve(request.result); db.close() }
      request.onerror = () => { resolve(null); db.close() }
    } catch {
      resolve(null)
      db.close()
    }
  })
}

export function isFreshDraft(draft: TryOnDraft | null | undefined, now = Date.now()): draft is TryOnDraft {
  return Boolean(draft && draft.photo && draft.items?.length && now - draft.savedAt < DRAFT_MAX_AGE_MS)
}

export async function saveDraft(draft: Omit<TryOnDraft, 'savedAt'>) {
  const saved: TryOnDraft = { ...draft, savedAt: Date.now() }
  memory = saved
  await run('readwrite', store => store.put(saved, KEY))
}

export async function loadDraft(): Promise<TryOnDraft | null> {
  const stored = (await run<TryOnDraft | undefined>('readonly', store => store.get(KEY))) ?? memory
  if (isFreshDraft(stored)) return stored
  if (stored) await clearDraft()
  return null
}

export async function clearDraft() {
  memory = null
  await run('readwrite', store => store.delete(KEY))
}
