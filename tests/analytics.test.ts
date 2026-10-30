import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDatabase } from './helpers/database'

// One customer (Asha) recharges Rs 500 (50 credits at Rs 10) and Rs 1,000
// (200 credits at Rs 5), makes pictures with free and paid credits, and one
// picture fails. Bala has a recharge waiting; Chitra has only signed in.
// Every number the admin page shows is checked against this.

const TERMS = '2026-10-26'
// Tokens OpenAI reports for one picture: (200 x $5 + 2,000 x $8 + 500 x $30)
// per million = $0.032 = Rs 2.816 at Rs 88.
const USAGE = { inputTextTokens: 200, inputImageTokens: 2000, outputTokens: 500 }
const COST = 2.816

type Json = Record<string, unknown>
type Analytics = {
  unit: string
  totals: Record<string, number>
  series: Array<{ bucket: string; receivedInr: number; aiCostInr: number; pictures: number; newCustomers: number }>
  categories: Array<{ category: string; pictures: number; fabric: number; stitched: number }>
}
type UserRow = Json & { email: string; paidInr: number; pictures: number; aiCostInr: number; earnedInr: number }

let db: PGlite
let asha: string
let bala: string
const looks: Record<string, string> = {}

async function one<T>(sql: string, params: unknown[] = []) {
  const result = await db.query<{ r: T }>(sql, params)
  return result.rows[0].r
}

// Each with a verified mobile number of their own (free credits need one).
let nextPhone = 8100000001
async function newUser(email: string, name: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, '{"provider":"google"}') returning id`,
    [email, JSON.stringify({ full_name: name })]
  )
  await db.query('select public.verify_phone($1, $2)', [rows[0].id, `+91${nextPhone++}`])
  return rows[0].id
}

const garment = (category: string, source = 'FABRIC', role = 'MAIN', index = 0) => ({ index, category, source, role })
const single = (category: string, source = 'FABRIC') => ({ kind: 'SINGLE', garments: [garment(category, source)] })
const pair = () => ({ kind: 'PAIR', garments: [garment('FORMAL_SHIRT'), garment('TROUSER', 'FABRIC', 'BOTTOM', 1)] })

async function createLooks(userId: string, list: unknown[]) {
  const result = await one<{ looks: Array<{ id: string }> }>(
    `select public.create_looks($1, gen_random_uuid(), 'photo.jpg', array['a.jpg','b.jpg','c.jpg'], now() + interval '3 days', $2, $3::jsonb) as r`,
    [userId, TERMS, JSON.stringify(list)]
  )
  return result.looks.map(look => look.id)
}

async function complete(id: string, usage: unknown = USAGE) {
  await db.query(`update public.looks set status = 'COMPLETED', ai_usage = $2::jsonb, image_path = 'x.webp' where id = $1`, [id, JSON.stringify(usage)])
}

const analytics = () => one<Analytics>(`select public.admin_analytics(now() - interval '1 day', now() + interval '1 day') as r`)

beforeAll(async () => {
  db = await freshDatabase()
  asha = await newUser('asha@example.com', 'Asha')
  bala = await newUser('bala@example.com', 'Bala')
  const chitra = await newUser('chitra@example.com', 'Chitra')
  await one('select public.get_account($1, $2) as r', [asha, TERMS])
  await one('select public.get_account($1, null) as r', [chitra])

  // Rs 500 approved by an admin, Rs 1,000 approved by its bank alert.
  const first = await one<{ recharge: { id: string } }>(`select public.submit_recharge($1, 'asha@example.com', 500, '700000000001') as r`, [asha])
  await one(`select public.review_recharge($1, null, 'APPROVE', null) as r`, [first.recharge.id])
  await one(`select public.submit_recharge($1, 'asha@example.com', 1000, '700000000002') as r`, [asha])
  await one(`select public.record_payment_alert('700000000002', 1000, 'VM-HDFCBK', 'Rs 1000 credited') as r`)
  await one(`select public.submit_recharge($1, 'bala@example.com', 100, '700000000003') as r`, [bala])

  // Batch 1 uses 4 of the 5 free credits; batch 2 uses the last free one and 2 paid.
  ;[looks.saree, looks.failed, looks.pair1] = await createLooks(asha, [single('SAREE'), single('SAREE'), pair()])
  ;[looks.pair2, looks.kurti] = await createLooks(asha, [pair(), single('KURTI', 'STITCHED')])
  for (const id of [looks.saree, looks.pair1, looks.pair2, looks.kurti]) await complete(id)
  await one(`select public.fail_look($1, 'The picture could not be made.') as r`, [looks.failed])
})

afterAll(async () => {
  await db?.close()
})

describe('admin numbers for a period', () => {
  it('adds up money received, credits sold and credits used', async () => {
    const { totals } = await analytics()
    expect(totals.receivedInr).toBe(1500)
    expect(totals.recharges).toBe(2)
    expect(totals.autoVerifiedRecharges).toBe(1)
    expect(totals.creditsSold).toBe(250)
    expect(totals.averagePricePerCreditInr).toBeCloseTo(6)
    expect(totals.pictures).toBe(4)
    expect(totals.pairPictures).toBe(2)
    expect(totals.failedPictures).toBe(1)
    expect(totals.freeCreditsUsed).toBe(4)
    expect(totals.paidCreditsUsed).toBe(2)
    expect(totals.valueOfCreditsUsedInr).toBeCloseTo(12)
  })

  it('works out AI cost from the tokens, including what free pictures cost', async () => {
    const { totals } = await analytics()
    expect(totals.aiCostInr).toBeCloseTo(4 * COST)
    // Saree (all free) + first pair (all free) + half of the second pair.
    expect(totals.freeAiCostInr).toBeCloseTo(2.5 * COST)
    expect(totals.unusedPaidCredits).toBe(248)
    expect(totals.unusedCreditsValueInr).toBeCloseTo(248 * 6)
  })

  it('counts customers and waiting payments', async () => {
    const { totals } = await analytics()
    expect(totals).toMatchObject({
      customers: 3, newCustomers: 3, activeCustomers: 1, payingCustomers: 1, payingCustomersEver: 1,
      pendingRecharges: 1, pendingInr: 100, unmatchedAlerts: 0, receivedEverInr: 1500,
    })
  })

  it('gives the money per day and the popular categories', async () => {
    const { unit, series, categories } = await analytics()
    expect(unit).toBe('day')
    expect(series.length).toBeGreaterThanOrEqual(2)
    expect(series.reduce((sum, day) => sum + day.receivedInr, 0)).toBe(1500)
    expect(series.reduce((sum, day) => sum + day.pictures, 0)).toBe(4)
    expect(series.reduce((sum, day) => sum + day.aiCostInr, 0)).toBeCloseTo(4 * COST)
    expect(categories).toEqual([
      { category: 'FORMAL_SHIRT', pictures: 2, fabric: 2, stitched: 0 },
      { category: 'KURTI', pictures: 1, fabric: 0, stitched: 1 },
      { category: 'SAREE', pictures: 1, fabric: 1, stitched: 0 },
    ])
  })

  it('shows long periods per month and refuses a backwards period', async () => {
    const year = await one<Analytics>(`select public.admin_analytics(now() - interval '1 year', now() + interval '1 day') as r`)
    expect(year.unit).toBe('month')
    expect(year.series.length).toBeGreaterThanOrEqual(12)
    await expect(db.query(`select public.admin_analytics(now(), now() - interval '1 day')`)).rejects.toThrow(/INVALID_INPUT/)
  })

  it('uses the AI rates from settings, so correcting a rate corrects the report', async () => {
    await db.query('update public.app_settings set usd_to_inr = 90')
    expect((await analytics()).totals.aiCostInr).toBeCloseTo((4 * COST * 90) / 88)
    await db.query('update public.app_settings set usd_to_inr = 88')
  })

  it('falls back to the saved estimate for pictures without token counts', async () => {
    const [extra] = await createLooks(asha, [single('GOWN')])
    await db.query(`update public.looks set status = 'COMPLETED', ai_usage = null, estimated_cost_inr = 3.5 where id = $1`, [extra])
    expect((await analytics()).totals.aiCostInr).toBeCloseTo(4 * COST + 3.5)
    await db.query(`update public.looks set status = 'FAILED', refunded_at = now() where id = $1`, [extra])
  })
})

describe('customers', () => {
  it('lists customers with what they paid, used, cost and earned', async () => {
    const { total, users } = await one<{ total: number; users: UserRow[] }>(`select public.admin_users(null, 'paid', 50, 0) as r`)
    expect(total).toBe(3)
    expect(users[0]).toMatchObject({ email: 'asha@example.com', name: 'Asha', provider: 'google', paidInr: 1500, recharges: 2, pictures: 4, failedPictures: 2, credits: 248 })
    expect(users[0].aiCostInr).toBeCloseTo(4 * COST)
    expect(users[0].earnedInr).toBeCloseTo(1500 - 4 * COST)
    expect(users.find(user => user.email === 'bala@example.com')).toMatchObject({ paidInr: 0, pendingRecharges: 1 })
  })

  it('searches by email or name and pages through', async () => {
    const byName = await one<{ total: number; users: UserRow[] }>(`select public.admin_users('BALA', 'recent', 50, 0) as r`)
    expect(byName.total).toBe(1)
    expect(byName.users[0].email).toBe('bala@example.com')
    const page = await one<{ total: number; users: UserRow[] }>(`select public.admin_users(null, 'recent', 2, 2) as r`)
    expect(page.total).toBe(3)
    expect(page.users).toHaveLength(1)
    const wildcard = await one<{ total: number }>(`select public.admin_users('%', 'recent', 50, 0) as r`)
    expect(wildcard.total).toBe(0)
  })

  it('shows one customer\'s recharges, pictures and credit history', async () => {
    const detail = await one<{ user: Json; totals: Json; recharges: Json[]; pictures: Json[]; ledger: Json[] }>(
      'select public.admin_user_detail($1) as r', [asha])
    expect(detail.user).toMatchObject({ email: 'asha@example.com', credits: 248, freeLeft: 0 })
    expect(detail.totals).toMatchObject({ paidInr: 1500, pictures: 4 })
    expect(detail.recharges).toHaveLength(2)
    expect(detail.pictures.length).toBe(6)
    expect(detail.pictures.find(picture => picture.id === looks.failed)).toMatchObject({ status: 'FAILED', refunded: true, aiCostInr: 0 })
    expect(detail.ledger.map(entry => entry.kind)).toEqual(expect.arrayContaining(['RECHARGE', 'TRY_ON', 'REFUND']))
    expect(await one('select public.admin_user_detail(gen_random_uuid()) as r')).toBeNull()
  })
})

describe('report permissions', () => {
  it('lets only the server read the reports', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await expect(db.query(`select public.admin_analytics(now() - interval '1 day', now())`)).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.admin_users(null, 'recent', 10, 0)`)).rejects.toThrow(/permission denied/)
        await expect(db.query('select public.admin_user_detail(gen_random_uuid())')).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    }
  })
})
