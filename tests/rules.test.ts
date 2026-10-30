import { describe, expect, it } from 'vitest'

import { garmentProfile, hasGarmentProfile } from '@/lib/garments'
import { parseUpiQr, phoneKind, upiAppLinks, upiLink } from '@/lib/upi'
import { buildCouplePrompt, buildPairPrompt, buildSinglePrompt } from '@/lib/prompts'
import {
  canPair,
  categoryLabel,
  coupleGarmentAllowed,
  DEFAULT_PRICING,
  fabricOnly,
  formatMobile,
  freeCreditsReturnDay,
  GARMENT_CATEGORIES,
  isGarmentCategory,
  normalizeMobile,
  normalizeUtr,
  OFFERED_CATEGORIES,
  paidCreditsNeeded,
  planLooks,
  quoteRecharge,
  rechargeChoices,
  sourceFor,
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
      extraCredits: 0,
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
    expect(planLooks(Array(4).fill(shirtAndPants[0]), [])).toMatchObject({ ok: false, message: /up to 3/ })
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

  it('dresses each person of a couple in their own garment', () => {
    const couple = buildCouplePrompt({ category: 'KURTA', source: 'FABRIC' }, { category: 'SAREE', source: 'STITCHED' })
    expect(couple).toMatch(/IMAGE 1 is the man and IMAGE 3 is the woman/)
    expect(couple).toMatch(/THE MAN \(IMAGE 1\) wears an? .*kurta.*, made only from IMAGE 2/i)
    expect(couple).toMatch(/THE WOMAN \(IMAGE 3\) wears an? .*saree.*, made only from IMAGE 4/i)
    expect(couple).toMatch(/IMAGE 4 is a photo of a READY-MADE, STITCHED saree/)
    expect(couple).toMatch(/onto the woman/)
    expect(couple).toMatch(/never dress one person in the other person's garment/)
    expect(couple).not.toMatch(/SAREE-SPECIFIC DRAPING RULES/)
    expect(couple).toMatch(/READY-MADE PRESERVATION/)
  })
})

describe('couple pictures', () => {
  it("take a men's garment for him and a women's garment for her, from those still offered", () => {
    expect(coupleGarmentAllowed('HIS', 'KURTA')).toBe(true)
    expect(coupleGarmentAllowed('HER', 'SAREE')).toBe(true)
    expect(coupleGarmentAllowed('HIS', 'SAREE')).toBe(false)
    expect(coupleGarmentAllowed('HER', 'SHERWANI')).toBe(false)
    expect(coupleGarmentAllowed('HER', 'BLOUSE')).toBe(false)
    expect(coupleGarmentAllowed('HIS', 'NOT_A_GARMENT')).toBe(false)
  })
})

describe('recharges', () => {
  it('quotes credits at the standard and bulk rates', () => {
    expect(quoteRecharge(400, DEFAULT_PRICING)).toEqual({ ok: true, rateInr: 8, credits: 50 })
    expect(quoteRecharge(50, DEFAULT_PRICING)).toMatchObject({ ok: false, message: /multiples of ₹8/ })
    expect(quoteRecharge(999, DEFAULT_PRICING)).toMatchObject({ ok: false, message: /multiples of ₹8/ })
    expect(quoteRecharge(1000, DEFAULT_PRICING)).toEqual({ ok: true, rateInr: 5, credits: 200 })
    expect(quoteRecharge(1005, DEFAULT_PRICING)).toEqual({ ok: true, rateInr: 5, credits: 201 })
    expect(quoteRecharge(32, DEFAULT_PRICING)).toMatchObject({ ok: false, message: /smallest/ })
    expect(quoteRecharge(10010, DEFAULT_PRICING)).toMatchObject({ ok: false, message: /largest/ })
  })

  it('offers one-tap amounts that buy whole credits at the current price', () => {
    expect(rechargeChoices(DEFAULT_PRICING)).toEqual([80, 160, 400, 1000, 2000])
    expect(rechargeChoices({ ...DEFAULT_PRICING, standardRateInr: 10, minRechargeInr: 50 })).toEqual([100, 200, 500, 1000, 2000])
  })

  it('offers only the garments still in the app, and keeps names for earlier pictures', () => {
    const offered = OFFERED_CATEGORIES.map(category => category.code)
    for (const gone of ['BLOUSE', 'SALWAR_SUIT', 'TROUSER', 'PYJAMA', 'WAISTCOAT']) {
      expect(offered, gone).not.toContain(gone)
      expect(isGarmentCategory(gone), gone).toBe(true)
    }
    expect(categoryLabel('TROUSER')).toBe('Pant')
    expect(offered).toEqual(expect.arrayContaining(['SAREE', 'CHUDIDHAR', 'KURTI', 'ANARKALI', 'LEHENGA', 'GOWN', 'FORMAL_SHIRT', 'KURTA', 'DHOTI', 'SHERWANI']))
    // Pairs still possible with what is offered: shirt or kurta with veshti, coat with shirt.
    expect(canPair('FORMAL_SHIRT', 'DHOTI')).toBe(true)
    expect(canPair('COAT', 'KURTA')).toBe(true)
  })

  it('allows only unstitched fabric for a saree or veshti', () => {
    expect(fabricOnly('SAREE')).toBe(true)
    expect(fabricOnly('DHOTI')).toBe(true)
    expect(fabricOnly('LEHENGA')).toBe(false)
    expect(fabricOnly(null)).toBe(false)
    expect(sourceFor('SAREE', 'STITCHED')).toBe('FABRIC')
    expect(sourceFor('DHOTI', 'STITCHED')).toBe('FABRIC')
    expect(sourceFor('LEHENGA', 'STITCHED')).toBe('STITCHED')
    expect(sourceFor('KURTI', 'FABRIC')).toBe('FABRIC')
  })

  it('accepts only a 12-digit UPI reference', () => {
    expect(normalizeUtr(' 6299 1234 5678 ')).toBe('629912345678')
    expect(normalizeUtr('T2410261234')).toBeNull()
    expect(normalizeUtr('62991234567')).toBeNull()
  })
})

describe('free credits', () => {
  it('come back on the 1st of next month, India time', () => {
    expect(freeCreditsReturnDay(new Date('2026-10-28T10:00:00Z'))).toBe('1 November')
    // 31 Oct, 8 pm UTC is already 1 Nov in India.
    expect(freeCreditsReturnDay(new Date('2026-10-31T20:00:00Z'))).toBe('1 December')
    expect(freeCreditsReturnDay(new Date('2026-12-15T10:00:00Z'))).toBe('1 January')
  })
})

describe('mobile numbers', () => {
  it('accepts what people type or their phone autofills', () => {
    for (const typed of ['9876543210', '98765 43210', '098765-43210', '+91 98765 43210', '+919876543210', '919876543210', '0091 9876543210', '(+91) 98765.43210']) {
      expect(normalizeMobile(typed), typed).toBe('+919876543210')
    }
    // A number that itself starts with 91.
    expect(normalizeMobile('9198765432')).toBe('+919198765432')
    expect(formatMobile('+919876543210')).toBe('98765 43210')
  })

  it('refuses landlines, short numbers and other countries', () => {
    for (const typed of ['', '044 2345 6789', '5876543210', '987654321', '98765432101', '+1 415 555 0100', 'abc']) {
      expect(normalizeMobile(typed), typed).toBeNull()
    }
  })
})

describe('paying from the phone', () => {
  const link = upiLink({ upiId: 'inaivuit@okaxis', payeeName: 'inaivu IT', amountInr: 80, note: 'PottuPaarkalaam ABCD1234' })

  it('opens each UPI app with the payee and amount filled in', () => {
    const query = link.slice(link.indexOf('?'))
    expect(query).toContain('pa=inaivuit%40okaxis')
    expect(query).toContain('am=80.00')
    expect(upiAppLinks(link, 'android').map(option => option.href)).toEqual([
      `phonepe://pay${query}`, `paytmmp://pay${query}`, `tez://upi/pay${query}`, link,
    ])
    expect(upiAppLinks(link, 'ios')[2].href).toBe(`gpay://upi/pay${query}`)
  })

  it('tells phones from computers', () => {
    expect(phoneKind('Mozilla/5.0 (Linux; Android 14; SM-A146B) Chrome/130 Mobile')).toBe('android')
    expect(phoneKind('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1')).toBe('ios')
    expect(phoneKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('other')
  })
})

describe('the business UPI QR', () => {
  const qrText = 'upi://pay?pa=9677757237@okbizaxis&pn=Inaivu%20IT&mc=7372&aid=uGICAgKDFvo2sEQ&tr=BCR2DN7T7WKK7ARK&ver=01&mode=01'

  it('reads the UPI ID, name and merchant category', () => {
    expect(parseUpiQr(qrText)).toMatchObject({ pa: '9677757237@okbizaxis', payeeName: 'Inaivu IT', merchantCode: '7372' })
    expect(parseUpiQr('https://example.com')).toBeNull()
    expect(parseUpiQr('')).toBeNull()
  })

  it('gives the pay links the same merchant details, adding only the amount and note', () => {
    const link = upiLink({ upiId: '9677757237@okbizaxis', payeeName: 'inaivu IT', amountInr: 80, note: 'PottuPaarkalaam ABCD1234', qrText })
    const params = new URLSearchParams(link.slice(link.indexOf('?') + 1))
    expect(Object.fromEntries(params)).toEqual({
      pa: '9677757237@okbizaxis', pn: 'Inaivu IT', mc: '7372', aid: 'uGICAgKDFvo2sEQ', tr: 'BCR2DN7T7WKK7ARK', ver: '01', mode: '01',
      am: '80.00', cu: 'INR', tn: 'PottuPaarkalaam ABCD1234',
    })
  })

  it('ignores a QR for another UPI ID, and a signature that would not match the amount', () => {
    const other = upiLink({ upiId: 'someone@okaxis', payeeName: null, amountInr: 40, note: 'x', qrText })
    expect(other).not.toContain('mc=')
    const signed = upiLink({ upiId: 'a@ok', payeeName: null, amountInr: 40, note: 'x', qrText: 'upi://pay?pa=a@ok&mc=5411&sign=abc' })
    expect(signed).toContain('mc=5411')
    expect(signed).not.toContain('sign=')
  })
})

describe('garment type in every prompt', () => {
  it('describes the shape of every garment the app offers, and what it must not become', () => {
    for (const category of OFFERED_CATEGORIES) {
      const profile = garmentProfile(category.code)
      expect(profile.shape.length, category.code).toBeGreaterThan(20)
      expect(profile.never.length, category.code).toBeGreaterThan(1)
      for (const source of ['FABRIC', 'STITCHED'] as const) {
        const prompt = buildSinglePrompt({ category: category.code, source })
        expect(prompt, category.code).toMatch(/Replace everything the customer is wearing/)
        expect(prompt.trim().split('\n').pop(), category.code).toMatch(/^GARMENT TYPE CHECK: The customer chose an? /)
        expect(prompt, category.code).not.toMatch(/\ba (?!one)[aeiou]/i)
      }
    }
  })

  it('keeps a chudidhar fabric from becoming a saree', () => {
    const prompt = buildSinglePrompt({ category: 'CHUDIDHAR', source: 'FABRIC' })
    expect(prompt).toMatch(/churidar trousers covering both legs/)
    expect(prompt).toMatch(/does not decide the garment type: it is\na chudidhar/)
    expect(prompt).toMatch(/It must not look like any of these: saree, half-saree, lehenga/)
  })

  it('checks both garments of a pair and of a couple', () => {
    const pair = buildPairPrompt({ category: 'FORMAL_SHIRT', source: 'FABRIC' }, { category: 'DHOTI', source: 'FABRIC' }, 'BOTTOM')
    expect(pair).toMatch(/GARMENT TYPE CHECK: For the main garment, the customer chose a shirt\.[^]*For the lower garment, the customer chose a dhoti/)
    const couple = buildCouplePrompt({ category: 'KURTA', source: 'FABRIC' }, { category: 'CHUDIDHAR', source: 'FABRIC' })
    expect(couple).toMatch(/For the woman, the customer chose a chudidhar/)
    expect(couple).toMatch(/keep none of their current clothes/)
  })
})

describe('extra photos', () => {
  const saree = { category: 'SAREE', source: 'FABRIC' as const }

  it('allow 3 photos normally and 5 with extra photos, the 4th and 5th costing extra', () => {
    expect(planLooks(Array(4).fill(saree), [])).toMatchObject({ ok: false })
    expect(planLooks(Array(3).fill(saree), [])).toMatchObject({ ok: true, credits: 3, extraCredits: 0 })
    expect(planLooks(Array(4).fill(saree), [], { maxGarments: 5, extraCredits: 1 })).toMatchObject({ ok: true, credits: 5, extraCredits: 1 })
    expect(planLooks(Array(5).fill(saree), [], { maxGarments: 5, extraCredits: 1 })).toMatchObject({ ok: true, credits: 7, extraCredits: 2 })
    expect(planLooks(Array(6).fill(saree), [], { maxGarments: 5, extraCredits: 1 })).toMatchObject({ ok: false })
  })

  it('take the extra from paid credits only', () => {
    // 5 photos (7 credits, 2 extra) with 5 free credits left: 2 paid credits.
    expect(paidCreditsNeeded({ credits: 7, extraCredits: 2 }, 5)).toBe(2)
    // With 3 free credits left: 2 normal + 2 extra = 4 paid credits.
    expect(paidCreditsNeeded({ credits: 7, extraCredits: 2 }, 3)).toBe(4)
    expect(paidCreditsNeeded({ credits: 3, extraCredits: 0 }, 3)).toBe(0)
  })
})
