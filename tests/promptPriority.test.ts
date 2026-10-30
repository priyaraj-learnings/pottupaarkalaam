import { describe, expect, it } from 'vitest'
import { garmentProfile } from '@/lib/garments'
import { buildSinglePrompt, buildPairPrompt, buildCouplePrompt } from '@/lib/prompts'
import { GARMENT_CATEGORIES, planPair, planLooks, canPair } from '@/lib/rules'

const sources = ['FABRIC', 'STITCHED'] as const

describe('priority-one prompt contracts', () => {
  for (const { code } of GARMENT_CATEGORIES) {
    it(`${code}: separates fabric construction from ready-made preservation`, () => {
      const profile = garmentProfile(code)
      const fabric = buildSinglePrompt({ category: code, source: 'FABRIC' })
      const stitched = buildSinglePrompt({ category: code, source: 'STITCHED' })
      expect(fabric).toContain(profile.shape)
      if (profile.rules) {
        expect(fabric).toContain(profile.rules)
        expect(stitched).not.toContain(profile.rules)
      }
      expect(stitched).not.toContain(profile.shape)
      expect(stitched).toContain('READY-MADE PRESERVATION')
      expect(stitched).toContain('contrast panels, buttons and trims')
      expect(stitched).toContain('do not replace visible pieces with plain defaults')
      for (const prompt of [fabric, stitched]) {
        expect(prompt).toContain('REFERENCE ALLOCATION')
        expect(prompt).not.toMatch(/role-labelled|Respect every role-labelled/)
        expect(prompt).not.toContain('Do not add embroidery, prints or colours')
      }
    })
  }

  it('drapes a saree or dhoti fabric instead of tailoring it into a stitched garment', () => {
    for (const category of ['SAREE', 'DHOTI']) {
      const prompt = buildSinglePrompt({ category, source: 'FABRIC' })
      expect(prompt, category).toContain('drape it, unstitched, as')
      expect(prompt, category).not.toContain('tailor a new')
    }
    expect(buildSinglePrompt({ category: 'KURTI', source: 'FABRIC' })).toContain('tailor a new')
  })

  it('names only the chosen garment, not other categories, when saying what one fabric makes', () => {
    for (const { code } of GARMENT_CATEGORIES) {
      const prompt = buildSinglePrompt({ category: code, source: 'FABRIC' })
      // No example garment that could pull the picture towards it (a lehenga turning into a saree).
      expect(prompt, code).not.toContain('for example a saree')
      if (code !== 'SAFARI') expect(prompt, code).not.toMatch(/safari/i)
    }
    expect(buildSinglePrompt({ category: 'LEHENGA', source: 'FABRIC' })).toContain('use it for the lehenga skirt')
    expect(buildSinglePrompt({ category: 'TROUSER', source: 'FABRIC' })).toContain('Dress the customer in a pair of formal trousers.')
  })

  it('keeps kurti, anarkali and lehenga apart', () => {
    expect(buildSinglePrompt({ category: 'KURTI', source: 'FABRIC' })).toContain('KURTI-SPECIFIC RULES')
    expect(buildSinglePrompt({ category: 'KURTI', source: 'FABRIC' })).toMatch(/must not look like any of these: anarkali/)
    expect(buildSinglePrompt({ category: 'ANARKALI', source: 'FABRIC' })).toContain('never a\nseparate skirt and blouse')
    expect(buildSinglePrompt({ category: 'LEHENGA', source: 'FABRIC' })).toMatch(/must not look like any of these: saree, gown, anarkali/)
  })

  it('mentions a dupatta for a shirt and trousers pair only for sets', () => {
    const shirt = buildPairPrompt({ category: 'FORMAL_SHIRT', source: 'FABRIC' }, { category: 'TROUSER', source: 'FABRIC' }, 'BOTTOM')
    expect(shirt).not.toContain('coordinating dupatta')
    const set = buildPairPrompt({ category: 'CHUDIDHAR', source: 'FABRIC' }, { category: 'PYJAMA', source: 'FABRIC' }, 'BOTTOM')
    expect(set).toContain('add a plain coordinating dupatta')
  })

  it('constructs both safari pieces from one fabric, without redesigning a ready-made suit', () => {
    const fabric = buildSinglePrompt({ category: 'SAFARI', source: 'FABRIC' })
    expect(fabric).toContain('chest and lower patch pockets')
    expect(fabric).toContain('full-length trousers')
    expect(fabric).toContain('BOTH pieces')
    const stitched = buildSinglePrompt({ category: 'SAFARI', source: 'STITCHED' })
    expect(stitched).not.toContain('SAFARI-SUIT-SPECIFIC RULES')
    expect(stitched).not.toContain('shoulder straps')
  })

  it('uses explicit references and plain fallbacks without assuming hidden piece uploads', () => {
    for (const category of ['SAREE', 'CHUDIDHAR', 'SALWAR_SUIT', 'LEHENGA', 'ANARKALI']) {
      const prompt = buildSinglePrompt({ category, source: 'FABRIC' })
      expect(prompt).toContain('only when their roles are\nvisually clear')
      expect(prompt).toContain('do not assume any exist or guess roles')
      expect(prompt).toContain('Only for pieces absent from the reference')
      expect(prompt).toContain('plain')
    }
  })

  for (const main of ['SHERWANI', 'FORMAL_SHIRT', 'CASUAL_SHIRT', 'KURTA']) {
    for (const bottom of ['PYJAMA', 'DHOTI', 'TROUSER'].filter(code => canPair(main, code))) {
      it(`${main} + ${bottom}: supplied bottom wins without introducing a different top`, () => {
        const prompt = buildPairPrompt({ category: main, source: 'FABRIC' }, { category: bottom, source: 'FABRIC' }, 'BOTTOM')
        expect(prompt).toContain('no neutral-bottom default applies')
        expect(prompt).not.toContain('complete the outfit with')
        expect(prompt).not.toContain('worn under a kurta')
        expect(prompt).not.toContain('keep the upper garment neutral')
        expect(prompt).not.toContain('keep the bottoms neutral')
        expect(prompt).toContain('The selected MAIN GARMENT supplies the top')
      })
    }
  }

  it('rejects incompatible outfits in both orders through UI and API planning', () => {
    for (const main of ['CHUDIDHAR', 'SALWAR_SUIT', 'ANARKALI', 'SHERWANI', 'COAT', 'JACKET', 'KURTI']) {
      expect(canPair(main, 'DHOTI')).toBe(false)
      expect(canPair('DHOTI', main)).toBe(false)
      expect(planLooks([{ category: main, source: 'FABRIC' }, { category: 'DHOTI', source: 'FABRIC' }], [[0, 1]]).ok).toBe(false)
    }
    expect(canPair('SAFARI', 'TROUSER')).toBe(false)
    expect(canPair('GOWN', 'TROUSER')).toBe(false)
    expect(canPair('FORMAL_SHIRT', 'DHOTI')).toBe(true)
    expect(canPair('KURTA', 'DHOTI')).toBe(true)
  })

  it('keeps supported pair ordering and all four source combinations consistent', () => {
    for (const first of GARMENT_CATEGORIES) for (const second of GARMENT_CATEGORIES) {
      const pair = planPair([first, second].map(g => ({ category: g.code })), 0, 1)
      const reversed = planPair([second, first].map(g => ({ category: g.code })), 0, 1)
      expect(Boolean(pair)).toBe(Boolean(reversed))
      if (!pair) continue
      const ordered = [first, second]
      for (const a of sources) for (const b of sources) {
        const main = { category: ordered[pair.main].code, source: a }
        const companion = { category: ordered[pair.companion].code, source: b }
        const prompt = buildPairPrompt(main, companion, pair.role)
        expect(prompt).toContain('IMAGE 2')
        expect(prompt).toContain('IMAGE 3')
        if (a === 'STITCHED' && b === 'STITCHED') {
          expect(prompt).not.toContain('-SPECIFIC RULES:')
          expect(prompt).not.toContain('Treat the supplied fabric')
        }
      }
    }
  })

  it('scopes mixed couple sources and defaults to their own references', () => {
    for (const a of sources) for (const b of sources) {
      const prompt = buildCouplePrompt({ category: 'COAT', source: a }, { category: 'GOWN', source: b })
      expect(prompt).toContain('REFERENCE ALLOCATION for IMAGE 2 (Coat / Blazer)')
      expect(prompt).toContain('REFERENCE ALLOCATION for IMAGE 4 (Gown)')
      expect(prompt.includes('Treat the supplied fabric')).toBe(a === 'FABRIC')
      expect(prompt.includes('GOWN-SPECIFIC RULES')).toBe(b === 'FABRIC')
      expect(prompt).toContain("never dress one person in the other person's garment")
    }
  })
})
