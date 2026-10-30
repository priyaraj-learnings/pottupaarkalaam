// =======================================================
// TRY-ON RULES
//
// Shared by the app screens and the server: the garment
// categories a customer can pick, which two garments can
// be worn together as a pair, and how a recharge turns
// into credits. No server-only imports.
// =======================================================

// Clothes photos per try: 3 for everyone; customers with a recharge approved
// this month can add a 4th and 5th ("extra photos"), each of those pictures
// costing the admin's extra credits more, from paid credits only.
export const MAX_GARMENTS = 3
export const MAX_GARMENTS_PAID = 5
export const RETENTION_DAYS = 3
export const PHOTO_BUCKET = 'try-on-photos'

// Bump when the consent card or /terms changes: everyone is asked to agree
// again before their next try-on.
export const TERMS_VERSION = '2026-10-30.2'

// Customers are asked to read the terms again at least once a year (IT Rules
// 2021, rule 3(1)(c)), even when nothing changed.
export const TERMS_REMINDER_DAYS = 365

// Why the consent screen must be shown before the app, if it must.
export function termsDue(
  account: { termsVersion: string | null; termsAcceptedAt: string | null },
  currentVersion: string,
  now: number,
): 'first' | 'updated' | 'yearly' | null {
  if (!account.termsVersion) return 'first'
  if (account.termsVersion !== currentVersion) return 'updated'
  if (!account.termsAcceptedAt || now - Date.parse(account.termsAcceptedAt) > TERMS_REMINDER_DAYS * 86_400_000) return 'yearly'
  return null
}

export type GarmentSource = 'FABRIC' | 'STITCHED'

export type GarmentCategory = {
  code: string
  label: string
  group: 'WOMEN' | 'MEN'
  // false: no longer offered in the app (kept so earlier pictures still show
  // their name, and pairs that use them still work for earlier photos).
  offered?: false
}

// Codes are UduthiPaar's garment profile codes (lib/garments.ts), so its AI
// instructions for each garment (saree draping, lehenga flare...) apply.
export const GARMENT_CATEGORIES: GarmentCategory[] = [
  { code: 'SAREE', label: 'Saree', group: 'WOMEN' },
  { code: 'BLOUSE', label: 'Blouse', group: 'WOMEN', offered: false },
  { code: 'CHUDIDHAR', label: 'Chudidhar', group: 'WOMEN' },
  { code: 'SALWAR_SUIT', label: 'Salwar suit', group: 'WOMEN', offered: false },
  { code: 'KURTI', label: 'Kurti', group: 'WOMEN' },
  { code: 'ANARKALI', label: 'Anarkali', group: 'WOMEN' },
  { code: 'LEHENGA', label: 'Lehenga', group: 'WOMEN' },
  { code: 'GOWN', label: 'Gown', group: 'WOMEN' },
  { code: 'FORMAL_SHIRT', label: 'Shirt', group: 'MEN' },
  { code: 'CASUAL_SHIRT', label: 'Casual shirt', group: 'MEN' },
  { code: 'TROUSER', label: 'Pant', group: 'MEN', offered: false },
  { code: 'KURTA', label: 'Kurta', group: 'MEN' },
  { code: 'PYJAMA', label: 'Pyjama / bottom', group: 'MEN', offered: false },
  { code: 'DHOTI', label: 'Dhoti / Veshti', group: 'MEN' },
  { code: 'SHERWANI', label: 'Sherwani', group: 'MEN' },
  { code: 'COAT', label: 'Coat / Blazer', group: 'MEN' },
  { code: 'WAISTCOAT', label: 'Nehru jacket', group: 'MEN', offered: false },
  { code: 'JACKET', label: 'Jacket', group: 'MEN' },
  { code: 'SAFARI', label: 'Safari suit', group: 'MEN' },
]

const CATEGORY_CODES = new Set(GARMENT_CATEGORIES.map(category => category.code))

// What a customer can pick today.
export const OFFERED_CATEGORIES = GARMENT_CATEGORIES.filter(category => category.offered !== false)

export function isGarmentCategory(code: unknown): code is string {
  return typeof code === 'string' && CATEGORY_CODES.has(code)
}

export function categoryLabel(code: string) {
  return GARMENT_CATEGORIES.find(category => category.code === code)?.label ?? code
}

// Worn as one unstitched length of cloth (a saree, a veshti): there is no
// stitched version to photograph, so only "Unstitched fabric".
export const FABRIC_ONLY_CATEGORIES: readonly string[] = ['SAREE', 'DHOTI']

export function fabricOnly(category: string | null | undefined) {
  return Boolean(category && FABRIC_ONLY_CATEGORIES.includes(category))
}

// The source to use for a category: always fabric for a saree or veshti.
export function sourceFor(category: string | null | undefined, source: GarmentSource): GarmentSource {
  return fabricOnly(category) ? 'FABRIC' : source
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

// Explicit supported outfits, not every possible top/bottom cross-product.
// Hidden categories remain usable for existing records and retry flows.
const PAIR_OPTIONS: Record<PairRole, Record<string, readonly string[]>> = {
  BLOUSE: { SAREE: ['BLOUSE'], LEHENGA: ['BLOUSE'] },
  INNER: {
    COAT: ['FORMAL_SHIRT', 'CASUAL_SHIRT', 'KURTA', 'KURTI'],
    JACKET: ['FORMAL_SHIRT', 'CASUAL_SHIRT', 'KURTA', 'KURTI'],
    WAISTCOAT: ['FORMAL_SHIRT', 'CASUAL_SHIRT', 'KURTA', 'KURTI'],
  },
  BOTTOM: {
    FORMAL_SHIRT: ['TROUSER', 'PYJAMA', 'DHOTI'],
    CASUAL_SHIRT: ['TROUSER', 'PYJAMA', 'DHOTI'],
    KURTA: ['TROUSER', 'PYJAMA', 'DHOTI'],
    KURTI: ['TROUSER', 'PYJAMA'],
    COAT: ['TROUSER'], JACKET: ['TROUSER'],
    SHERWANI: ['TROUSER', 'PYJAMA'],
    SALWAR_SUIT: ['PYJAMA'], CHUDIDHAR: ['PYJAMA'], ANARKALI: ['PYJAMA'],
  },
}

function orderedPair(first: string, second: string): { role: PairRole; swap: boolean } | null {
  for (const role of ['BLOUSE', 'INNER', 'BOTTOM'] as const) {
    if (PAIR_OPTIONS[role][first]?.includes(second)) return { role, swap: false }
    if (PAIR_OPTIONS[role][second]?.includes(first)) return { role, swap: true }
  }
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
  // HIS / HER: the two garments of a couple picture.
  role: 'MAIN' | PairRole | CoupleRole
}

// =======================================================
// COUPLE PICTURES
//
// One picture of two people, him and her, each in their
// own new garment. Paid credits only, at the price the
// admin sets.
// =======================================================

export type CoupleRole = 'HIS' | 'HER'

export type LookKind = 'SINGLE' | 'PAIR' | 'COUPLE'

// Whose garment it can be: men's garments for him, women's for her, from
// what the app offers today.
export function coupleGarmentAllowed(role: CoupleRole, category: string) {
  const garment = OFFERED_CATEGORIES.find(item => item.code === category)
  return Boolean(garment && garment.group === (role === 'HIS' ? 'MEN' : 'WOMEN'))
}

export type PlannedLook = {
  kind: 'SINGLE' | 'PAIR'
  garments: LookGarment[]
}

// credits: all of it; extraCredits: the part only paid credits can pay.
export type LookPlan =
  | { ok: true; looks: PlannedLook[]; credits: number; extraCredits: number }
  | { ok: false; message: string }

export function planLooks(
  garments: ReadonlyArray<{ category: string; source: GarmentSource }>,
  pairs: ReadonlyArray<readonly [number, number]>,
  // maxGarments: MAX_GARMENTS_PAID with extra photos; extraCredits: the extra
  // per photo beyond MAX_GARMENTS (SQL create_looks charges the same).
  options: { maxGarments?: number; extraCredits?: number } = {}
): LookPlan {
  const maxGarments = options.maxGarments ?? MAX_GARMENTS
  if (!garments.length) return { ok: false, message: 'Add a photo of the clothes first.' }
  if (garments.length > maxGarments) return { ok: false, message: `Add up to ${maxGarments} clothes at a time.` }
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
  const extraCredits = (options.extraCredits ?? 1) * Math.max(0, garments.length - MAX_GARMENTS)
  return { ok: true, looks, credits: looks.reduce((sum, look) => sum + LOOK_CREDITS[look.kind], 0) + extraCredits, extraCredits }
}

// Paid credits a try needs: free credits pay only for the normal part.
export function paidCreditsNeeded(plan: { credits: number; extraCredits: number }, freeLeft: number) {
  const normal = plan.credits - plan.extraCredits
  return normal - Math.min(freeLeft, normal) + plan.extraCredits
}

// =======================================================
// PRICES
// =======================================================

export const DEFAULT_COUPLE_CREDITS = 3

export type Pricing = {
  freeCreditsPerMonth: number
  standardRateInr: number
  bulkRateInr: number
  bulkMinRechargeInr: number
  minRechargeInr: number
  maxRechargeInr: number
}

// Until the admin sets prices in /admin Settings.
export const DEFAULT_PRICING: Pricing = {
  freeCreditsPerMonth: 3,
  standardRateInr: 8,
  bulkRateInr: 5,
  bulkMinRechargeInr: 1000,
  minRechargeInr: 40,
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

// Amounts offered as one tap on the recharge screen: 10, 20 and 50 credits at
// the standard price (₹80, ₹160, ₹400 at ₹8), then the bulk amounts.
export function rechargeChoices(pricing: Pricing) {
  const standard = [10, 20, 50].map(credits => credits * pricing.standardRateInr).filter(amount => amount < pricing.bulkMinRechargeInr)
  const amounts = [...standard, pricing.bulkMinRechargeInr, pricing.bulkMinRechargeInr * 2]
  return [...new Set(amounts)]
    .filter(amount => quoteRecharge(amount, pricing).ok)
    .sort((a, b) => a - b)
}

// The 12-digit UPI reference (UTR / RRN) the payment app shows.
export function normalizeUtr(value: string) {
  const digits = value.replace(/\s+/g, '')
  return /^\d{12}$/.test(digits) ? digits : null
}

// An Indian mobile number as +91 and 10 digits, from what people type or their
// phone autofills: "98765 43210", "098765-43210", "+91 98765 43210".
export function normalizeMobile(value: string) {
  const digits = value.replace(/[\s().-]/g, '').replace(/^(\+91|0091|91(?=\d{10}$))/, '').replace(/^0(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}

// "+919876543210" → "98765 43210".
export function formatMobile(phone: string) {
  const digits = phone.replace(/^\+91/, '')
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}

// Someone who taps "Not now" is asked for their mobile number again after this.
export const MOBILE_ASK_AGAIN_DAYS = 30

// When this month's free credits come back: the 1st of next month, India time.
export function freeCreditsReturnDay(now: Date) {
  const india = new Date(now.getTime() + 5.5 * 3_600_000)
  const next = new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth() + 1, 1))
  return next.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// People who sign in with their mobile number get a stand-in email address:
// Supabase makes the session from an email sign-in link that only the server
// creates (lib/server/phoneLogin.ts). Nothing is ever emailed to it, and the app
// shows the mobile number instead.
export function phoneLoginEmail(phone: string) {
  return `pp-phone-${phone.replace(/\D/g, '')}@inaivuit.com`
}

export function isPhoneLoginEmail(email: string | null | undefined) {
  return Boolean(email && /^pp-phone-\d{12}@inaivuit\.com$/.test(email))
}
