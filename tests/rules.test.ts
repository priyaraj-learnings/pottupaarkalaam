import { describe, expect, it } from 'vitest'

import { hasGarmentProfile } from '@/lib/garments'
import { buildPairPrompt, buildSinglePrompt } from '@/lib/prompts'
import {
  canPair,
  DEFAULT_PRICING,
  GARMENT_CATEGORIES,
  normalizeUtr,
  planLooks,
  quoteRecharge,
  rechargeChoices,
} from '@/lib/rules'

describe('categories', () => {
  it('has AI instructions for every category a customer can pick', () => {
    for (const category of GARMENT_CATEGORIES) {
      expect(hasGarmentProfile(category.code), category.code).toBe(true)
      expect(() => buildSinglePrompt({ category: category.code, source: 'FABRIC' })).not.toThrow()
    }
  })
})

describe('pairs', () => {
  it('pairs tops with bottoms, sarees with blouses and layers', () => {
    expect(canPair('FORMAL_SHIRT', 'TROUSER')).toBe(true)
    expect(canPair('TROUSER', 'KURTA')).toBe(true)
    expect(canPair('SAREE', 'BLOUSE')).toBe(true)
    expect(canPair('BLOUSE', 'LEHENGA')).toBe(true)
    expect(canPair('WAISTCOAT', 'KURTA')).toBe(true)
    expect(canPair('KURTI', 'PYJAMA')).toBe(true)
    expect(canPair('SAREE', 'SAREE')).toBe(false)
    expect(canPair('GOWN', 'TROUSER')).toBe(false)
    expect(canPair('SAFARI', 'TROUSER')).toBe(false)
  })

  it('makes one picture per garment unless paired, with the main garment first', () => {
    const garments = [
      { category: 'TROUSER', source: 'FABRIC' as const },
      { category: 'FORMAL_SHIRT', source: 'FABRIC' as const },
      { category: 'SAREE', source: 'STITCHED' as const },
    ]
    const plan = planLooks(garments, [[0, 1]])
    expect(plan).toEqual({
      ok: true,
      credits: 3,
      looks: [
        {
          kind: 'PAIR',
          garments: [
            { index: 1, category: 'FORMAL_SHIRT', source: 'FABRIC', role: 'MAIN' },
            { index: 0, category: 'TROUSER', source: 'FABRIC', role: 'BOTTOM' },
          ],
        },
        { kind: 'SINGLE', garments: [{ index: 2, category: 'SAREE', source: 'STITCHED', role: 'MAIN' }] },
      ],
    })
    expect(planLooks(garments, []).ok && planLooks(garments, [])).toMatchObject({ credits: 3 })
  })

  it('refuses bad plans', () => {
    const shirtAndPants = [
      { category: 'FORMAL_SHIRT', source: 'FABRIC' as const },
      { category: 'TROUSER', source: 'FABRIC' as const },
      { category: 'DHOTI', source: 'FABRIC' as const },
    ]
    expect(planLooks([], [])).toMatchObject({ ok: false })
    expect(planLooks(shirtAndPants, [[0, 1], [0, 2]])).toMatchObject({ ok: false, message: /one pair/ })
    expect(planLooks(shirtAndPants, [[1, 2]])).toMatchObject({ ok: false, message: /cannot be worn together/ })
    expect(planLooks(shirtAndPants, [[0, 9]])).toMatchObject({ ok: false })
    expect(planLooks(Array(6).fill(shirtAndPants[0]), [])).toMatchObject({ ok: false, message: /up to 5/ })
    expect(planLooks([{ category: 'EARRINGS', source: 'FABRIC' }], [])).toMatchObject({ ok: false })
  })
})

describe('prompts', () => {
  it('tells the model how to read fabric and stitched photos', () => {
    const fabric = buildSinglePrompt({ category: 'SAREE', source: 'FABRIC' })
    expect(fabric).toMatch(/UNSTITCHED FABRIC/)
    expect(fabric).toMatch(/SAREE-SPECIFIC DRAPING RULES/)
    expect(fabric).toMatch(/IMAGE 1 is the customer/)

    const stitched = buildSinglePrompt({ category: 'KURTI', source: 'STITCHED' })
    expect(stitched).toMatch(/READY-MADE, STITCHED kurti/)
    expect(stitched).toMatch(/Never copy the face/)
  })

  it('places each garment of a pair by its role', () => {
    const blouse = buildPairPrompt({ category: 'SAREE', source: 'FABRIC' }, { category: 'BLOUSE', source: 'FABRIC' }, 'BLOUSE')
    expect(blouse).toMatch(/IMAGE 3/)
    expect(blouse).toMatch(/never use it on the saree body or pallu/)
    expect(blouse).not.toMatch(/keep any saree or skirt worn with it plain/)

    const dhoti = buildPairPrompt({ category: 'FORMAL_SHIRT', source: 'FABRIC' }, { category: 'DHOTI', source: 'STITCHED' }, 'BOTTOM')
    expect(dhoti).toMatch(/untucked over the dhoti/)

    const layer = buildPairPrompt({ category: 'WAISTCOAT', source: 'FABRIC' }, { category: 'KURTA', source: 'FABRIC' }, 'INNER')
    expect(layer).toMatch(/outer layer over the kurta/)
  })
})

describe('recharges', () => {
  it('quotes credits at the standard and bulk rates', () => {
    expect(quoteRecharge(500, DEFAULT_PRICING)).toEqual({ ok: true, rateInr: 10, credits: 50 })
    expect(quoteRecharge(999, DEFAULT_PRICING)).toMatchObject({ ok: false, message: /multiples of ₹10/ })
    expect(quoteRecharge(1000, DEFAULT_PRICING)).toEqual({ ok: true, rateInr: 5, credits: 200 })
    expect(quoteRecharge(1005, DEFAULT_PRICING)).toEqual({ ok: true, rateInr: 5, credits: 201 })
    expect(quoteRecharge(40, DEFAULT_PRICING)).toMatchObject({ ok: false, message: /smallest/ })
    expect(quoteRecharge(10010, DEFAULT_PRICING)).toMatchObject({ ok: false, message: /largest/ })
    expect(rechargeChoices(DEFAULT_PRICING)).toEqual([100, 200, 500, 1000, 2000])
  })

  it('accepts only a 12-digit UPI reference', () => {
    expect(normalizeUtr(' 6299 1234 5678 ')).toBe('629912345678')
    expect(normalizeUtr('T2410261234')).toBeNull()
    expect(normalizeUtr('62991234567')).toBeNull()
  })
})
