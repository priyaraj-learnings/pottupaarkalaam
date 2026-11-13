import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { pictureIdFrom } from '@/lib/server/adminSafety'

describe('finding a picture by its ID', () => {
  it('reads pp-<id>, a bare id, or text around it', () => {
    const id = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
    expect(pictureIdFrom(`pp-${id}`)).toBe(id)
    expect(pictureIdFrom(id.toUpperCase())).toBe(id)
    expect(pictureIdFrom(`AI-generated · PottuPaarkalaam (ID pp-${id})`)).toBe(id)
    expect(pictureIdFrom('pp-123')).toBeNull()
  })
})
