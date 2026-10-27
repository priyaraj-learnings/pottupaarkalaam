// =======================================================
// TRY-ON RULES
//
// Shared by the app screens and the server: the garment
// categories a customer can pick, which two garments can
// be worn together as a pair, and how a recharge turns
// into credits. No server-only imports.
// =======================================================

export const MAX_GARMENTS = 5
export const RETENTION_DAYS = 3
export const PHOTO_BUCKET = 'try-on-photos'

// Bump when the consent card or /terms changes: everyone is asked to agree
// again before their next try-on.
export const TERMS_VERSION = '2026-10-26'

export type GarmentSource = 'FABRIC' | 'STITCHED'

export type GarmentCategory = {
  code: string
  label: string
  group: 'WOMEN' | 'MEN'
}

// Codes are UduthiPaar's garment profile codes (lib/garments.ts), so its AI
// instructions for each garment (saree draping, lehenga flare...) apply.
export const GARMENT_CATEGORIES: GarmentCategory[] = [
  { code: 'SAREE', label: 'Saree', group: 'WOMEN' },
  { code: 'BLOUSE', label: 'Blouse', group: 'WOMEN' },
  { code: 'CHUDIDHAR', label: 'Chudidhar', group: 'WOMEN' },
  { code: 'SALWAR_SUIT', label: 'Salwar suit', group: 'WOMEN' },
  { code: 'KURTI', label: 'Kurti', group: 'WOMEN' },
  { code: 'ANARKALI', label: 'Anarkali', group: 'WOMEN' },
  { code: 'LEHENGA', label: 'Lehenga', group: 'WOMEN' },
  { code: 'GOWN', label: 'Gown', group: 'WOMEN' },
  { code: 'FORMAL_SHIRT', label: 'Shirt', group: 'MEN' },
  { code: 'CASUAL_SHIRT', label: 'Casual shirt', group: 'MEN' },
  { code: 'TROUSER', label: 'Pant', group: 'MEN' },
  { code: 'KURTA', label: 'Kurta', group: 'MEN' },
  { code: 'PYJAMA', label: 'Pyjama / bottom', group: 'MEN' },
  { code: 'DHOTI', label: 'Dhoti / Veshti', group: 'MEN' },
  { code: 'SHERWANI', label: 'Sherwani', group: 'MEN' },
  { code: 'COAT', label: 'Coat / Blazer', group: 'MEN' },
  { code: 'WAISTCOAT', label: 'Nehru jacket', group: 'MEN' },
  { code: 'JACKET', label: 'Jacket', group: 'MEN' },
  { code: 'SAFARI', label: 'Safari suit', group: 'MEN' },
]

const CATEGORY_CODES = new Set(GARMENT_CATEGORIES.map(category => category.code))

export function isGarmentCategory(code: unknown): code is string {
  return typeof code === 'string' && CATEGORY_CODES.has(code)
}

export function categoryLabel(code: string) {
  return GARMENT_CATEGORIES.find(category => category.code === code)?.label ?? code
}

export const SOURCE_LABELS: Record<GarmentSource, string> = {
  FABRIC: 'Unstitched fabric',
  STITCHED: 'Stitched dress',
}

// =======================================================
// PAIRS
//
// Two garments in one picture. The main garment is shown
// on the customer; the companion is worn with it as:
//   BOTTOM - the lower garment (shirt + pant, kurti + bottom)
//   BLOUSE - the blouse of a saree or lehenga
//   INNER  - what is worn under a coat or Nehru jacket
// =======================================================

export type PairRole = 'BOTTOM' | 'BLOUSE' | 'INNER'

export type PairPlan = {
  main: number
  companion: number
  role: PairRole
}

const TOPS = new Set(['FORMAL_SHIRT', 'CASUAL_SHIRT', 'KURTA', 'KURTI', 'COAT', 'JACKET', 'SHERWANI', 'SALWAR_SUIT', 'CHUDIDHAR', 'ANARKALI'])
const BOTTOMS = new Set(['TROUSER', 'PYJAMA', 'DHOTI'])
const DRAPES_WITH_BLOUSE = new Set(['SAREE', 'LEHENGA'])
const OUTER_LAYERS = new Set(['COAT', 'JACKET', 'WAISTCOAT'])
const INNER_LAYERS = new Set(['FORMAL_SHIRT', 'CASUAL_SHIRT', 'KURTA', 'KURTI'])

function orderedPair(first: string, second: string): { role: PairRole; swap: boolean } | null {
  if (DRAPES_WITH_BLOUSE.has(first) && second === 'BLOUSE') return { role: 'BLOUSE', swap: false }
  if (DRAPES_WITH_BLOUSE.has(second) && first === 'BLOUSE') return { role: 'BLOUSE', swap: true }
  if (OUTER_LAYERS.has(first) && INNER_LAYERS.has(second)) return { role: 'INNER', swap: false }
  if (OUTER_LAYERS.has(second) && INNER_LAYERS.has(first)) return { role: 'INNER', swap: true }
  if (TOPS.has(first) && BOTTOMS.has(second)) return { role: 'BOTTOM', swap: false }
  if (TOPS.has(second) && BOTTOMS.has(first)) return { role: 'BOTTOM', swap: true }
  return null
}

// Which of two garments (by position) is the main one, or null when they do
// not make an outfit together (two sarees, a gown and a pant...).
export function planPair(
  garments: ReadonlyArray<{ category: string }>,
  first: number,
  second: number
): PairPlan | null {
  const a = garments[first]?.category
  const b = garments[second]?.category
  if (!a || !b || first === second) return null
  const order = orderedPair(a, b)
  if (!order) return null
  return order.swap
    ? { main: second, companion: first, role: order.role }
    : { main: first, companion: second, role: order.role }
}

export function canPair(first: string, second: string) {
  return orderedPair(first, second) !== null
}

// =======================================================
// LOOKS: the pictures one "Try on" press makes
//
// Every garment photo is one picture, unless it is paired
// with another one: then the two make one picture together.
// =======================================================

export type LookGarment = {
  index: number
  category: string
  source: GarmentSource
  role: 'MAIN' | PairRole
}

export type PlannedLook = {
  kind: 'SINGLE' | 'PAIR'
  garments: LookGarment[]
}

export type LookPlan =
  | { ok: true; looks: PlannedLook[]; credits: number }
  | { ok: false; message: string }

export function planLooks(
  garments: ReadonlyArray<{ category: string; source: GarmentSource }>,
  pairs: ReadonlyArray<readonly [number, number]>
): LookPlan {
  if (!garments.length) return { ok: false, message: 'Add a photo of the clothes first.' }
  if (garments.length > MAX_GARMENTS) return { ok: false, message: `Add up to ${MAX_GARMENTS} clothes at a time.` }
  for (const garment of garments) {
    if (!isGarmentCategory(garment.category) || !(garment.source in SOURCE_LABELS)) {
      return { ok: false, message: 'Choose what each photo is.' }
    }
  }

  const pairOf = new Map<number, PairPlan>()
  for (const [first, second] of pairs) {
    if (pairOf.has(first) || pairOf.has(second)) return { ok: false, message: 'Each photo can be in one pair only.' }
    const plan = planPair(garments, first, second)
    if (!plan) return { ok: false, message: 'These two clothes cannot be worn together.' }
    pairOf.set(first, plan)
    pairOf.set(second, plan)
  }

  const garmentAt = (index: number, role: LookGarment['role']): LookGarment => ({
    index, category: garments[index].category, source: garments[index].source, role,
  })
  const looks: PlannedLook[] = []
  garments.forEach((_garment, index) => {
    const plan = pairOf.get(index)
    if (!plan) {
      looks.push({ kind: 'SINGLE', garments: [garmentAt(index, 'MAIN')] })
    } else if (index === Math.min(plan.main, plan.companion)) {
      looks.push({ kind: 'PAIR', garments: [garmentAt(plan.main, 'MAIN'), garmentAt(plan.companion, plan.role)] })
    }
  })
  return { ok: true, looks, credits: looks.reduce((sum, look) => sum + LOOK_CREDITS[look.kind], 0) }
}

// =======================================================
// PRICES
// =======================================================

export type Pricing = {
  freeCreditsPerMonth: number
  standardRateInr: number
  bulkRateInr: number
  bulkMinRechargeInr: number
  minRechargeInr: number
  maxRechargeInr: number
}

export const DEFAULT_PRICING: Pricing = {
  freeCreditsPerMonth: 5,
  standardRateInr: 10,
  bulkRateInr: 5,
  bulkMinRechargeInr: 1000,
  minRechargeInr: 50,
  maxRechargeInr: 10000,
}

export const LOOK_CREDITS = { SINGLE: 1, PAIR: 2 } as const

export function rechargeRateInr(amountInr: number, pricing: Pricing) {
  return amountInr >= pricing.bulkMinRechargeInr ? pricing.bulkRateInr : pricing.standardRateInr
}

export type RechargeQuote =
  | { ok: true; rateInr: number; credits: number }
  | { ok: false; message: string }

// The same checks as submit_recharge (SQL), so the screen can explain them
// before the customer pays.
export function quoteRecharge(amountInr: number, pricing: Pricing): RechargeQuote {
  if (!Number.isInteger(amountInr) || amountInr < pricing.minRechargeInr) {
    return { ok: false, message: `The smallest recharge is ₹${pricing.minRechargeInr}.` }
  }
  if (amountInr > pricing.maxRechargeInr) {
    return { ok: false, message: `The largest recharge is ₹${pricing.maxRechargeInr.toLocaleString('en-IN')}.` }
  }
  const rateInr = rechargeRateInr(amountInr, pricing)
  if (amountInr % rateInr !== 0) {
    return { ok: false, message: `Enter an amount in multiples of ₹${rateInr}.` }
  }
  return { ok: true, rateInr, credits: amountInr / rateInr }
}

// Amounts offered as one tap on the recharge screen.
export function rechargeChoices(pricing: Pricing) {
  const amounts = [100, 200, 500, pricing.bulkMinRechargeInr, pricing.bulkMinRechargeInr * 2]
  return [...new Set(amounts)]
    .filter(amount => quoteRecharge(amount, pricing).ok)
    .sort((a, b) => a - b)
}

// The 12-digit UPI reference (UTR / RRN) the payment app shows.
export function normalizeUtr(value: string) {
  const digits = value.replace(/\s+/g, '')
  return /^\d{12}$/.test(digits) ? digits : null
}
