import { describe, expect, it } from 'vitest'

import { DRAFT_MAX_AGE_MS, isFreshDraft, type TryOnDraft } from '@/lib/client/tryOnDraft'

const draft = (savedAt: number, items = 1): TryOnDraft => ({
  category: 'SAREE', source: 'FABRIC', pairs: [], photo: new Blob(['me']), savedAt,
  items: Array.from({ length: items }, () => ({ blob: new Blob(['fabric']), category: 'SAREE', source: 'FABRIC' as const })),
})

describe('a try-on started before signing in', () => {
  it('is used for up to a day, and only with a photo and clothes', () => {
    const now = Date.parse('2026-11-01T10:00:00Z')
    expect(isFreshDraft(draft(now - 60_000), now)).toBe(true)
    expect(isFreshDraft(draft(now - DRAFT_MAX_AGE_MS - 1), now)).toBe(false)
    expect(isFreshDraft(draft(now, 0), now)).toBe(false)
    expect(isFreshDraft(null, now)).toBe(false)
  })
})
