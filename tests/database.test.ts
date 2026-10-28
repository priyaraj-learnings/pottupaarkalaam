import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDatabase } from './helpers/database'

const TERMS = '2026-10-26'

// What the SQL functions return (jsonb), loosely typed for the tests.
type Result = Record<string, unknown> & {
  looks: Array<{ id: string }>
  recharge: Record<string, unknown> & { id: string }
  repeat?: boolean
}

let db: PGlite

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const result = await db.query<{ r: T }>(sql, params)
  return result.rows[0].r
}

async function newUser(email: string) {
  const { rows } = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email])
  return rows[0].id
}

const single = (index: number, category = 'SAREE') => ({
  kind: 'SINGLE', garments: [{ index, category, source: 'FABRIC', role: 'MAIN' }],
})
const pair = (main: number, companion: number) => ({
  kind: 'PAIR',
  garments: [
    { index: main, category: 'FORMAL_SHIRT', source: 'FABRIC', role: 'MAIN' },
    { index: companion, category: 'TROUSER', source: 'FABRIC', role: 'BOTTOM' },
  ],
})

async function createLooks(userId: string, looks: unknown[], terms = TERMS) {
  const garmentPaths = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']
  return one<Result>(
    `select public.create_looks($1, gen_random_uuid(), 'photo.jpg', $2::text[], now() + interval '3 days', $3, $4::jsonb) as r`,
    [userId, garmentPaths, terms, JSON.stringify(looks)]
  )
}

const account = (userId: string) => one<Result>('select public.get_account($1, null) as r', [userId])
const submit = (userId: string, amount: number, utr: string) =>
  one<Result>(`select public.submit_recharge($1, 'x@example.com', $2, $3) as r`, [userId, amount, utr])
const alert = (utr: string, amount: number) =>
  one<Result>(`select public.record_payment_alert($1, $2, 'VM-HDFCBK', 'Rs credited') as r`, [utr, amount])

beforeAll(async () => {
  db = await freshDatabase()
})

afterAll(async () => {
  await db?.close()
})

describe('accounts and free credits', () => {
  it('gives a new account 5 free credits and records the terms', async () => {
    const user = await newUser('new@example.com')
    expect(await account(user)).toMatchObject({ credits: 0, freeLeft: 5, freeCreditsPerMonth: 5, termsVersion: null })
    const accepted = await one<Result>('select public.get_account($1, $2) as r', [user, TERMS])
    expect(accepted.termsVersion).toBe(TERMS)
  })

  it('refuses try-ons until the current terms are accepted', async () => {
    const user = await newUser('terms@example.com')
    expect(await createLooks(user, [single(0)])).toEqual({ error: 'TERMS_REQUIRED' })
    await one('select public.get_account($1, $2) as r', [user, '2020-01-01'])
    expect(await createLooks(user, [single(0)])).toEqual({ error: 'TERMS_REQUIRED' })
  })

  it('uses free credits first, then paid ones, and refuses when short', async () => {
    const user = await newUser('looks@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])

    const first = await createLooks(user, [single(0), pair(1, 2)])
    expect(first.looks).toHaveLength(2)
    expect(first.account).toMatchObject({ credits: 0, freeLeft: 2 })

    const short = await createLooks(user, [pair(0, 1), single(2)])
    expect(short).toMatchObject({ error: 'INSUFFICIENT_CREDITS', needed: 3, available: 2 })
    // Nothing was taken or queued for the refused press.
    expect(await account(user)).toMatchObject({ freeLeft: 2 })
    const { rows } = await db.query('select count(*)::int as n from public.looks where user_id = $1', [user])
    expect(rows[0]).toEqual({ n: 2 })

    await db.query(`select public.adjust_credits('looks@example.com', null, 10, 'Goodwill credit')`)
    const mixed = await createLooks(user, [single(0), pair(1, 2)])
    expect(mixed.account).toMatchObject({ credits: 9, freeLeft: 0 })
    const { rows: split } = await db.query<{ free_credits_used: number; paid_credits_used: number }>(
      'select free_credits_used, paid_credits_used from public.looks where id = $1', [mixed.looks[1].id]
    )
    expect(split[0]).toEqual({ free_credits_used: 1, paid_credits_used: 1 })
  })

  it('resets the free credits in a new month', async () => {
    const user = await newUser('month@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    await createLooks(user, [single(0), single(1), single(2)])
    expect(await account(user)).toMatchObject({ freeLeft: 2 })
    await db.query(`update public.accounts set free_month = free_month - interval '1 month' where user_id = $1`, [user])
    expect(await account(user)).toMatchObject({ freeLeft: 5 })
  })
})

describe('failed try-ons', () => {
  it('gives the credits back once', async () => {
    const user = await newUser('refund@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    const free = await createLooks(user, [pair(0, 1), pair(2, 3), single(4)])
    expect(free.account).toMatchObject({ credits: 0, freeLeft: 0 })
    await db.query(`select public.adjust_credits('refund@example.com', null, 4, 'Test credits')`)
    const paid = await createLooks(user, [pair(0, 1), pair(2, 3)])
    expect(paid.account).toMatchObject({ credits: 0, freeLeft: 0 })

    const pairLook = paid.looks[1].id
    expect(await one(`select public.fail_look($1, 'Provider error') as r`, [pairLook])).toEqual({ status: 'FAILED', refunded: true })
    expect(await account(user)).toMatchObject({ credits: 2, freeLeft: 0 })
    expect(await one(`select public.fail_look($1, 'Again') as r`, [pairLook])).toEqual({ status: 'FAILED', refunded: true })
    expect(await account(user)).toMatchObject({ credits: 2 })

    // Free credits come back as free credits in the same month.
    await one(`select public.fail_look($1, 'Provider error') as r`, [free.looks[2].id])
    expect(await account(user)).toMatchObject({ credits: 2, freeLeft: 1 })
  })

  it('never refunds a finished try-on', async () => {
    const user = await newUser('done@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    const created = await createLooks(user, [single(0)])
    await db.query(`update public.looks set status = 'COMPLETED' where id = $1`, [created.looks[0].id])
    expect(await one(`select public.fail_look($1, 'late') as r`, [created.looks[0].id])).toEqual({ status: 'COMPLETED', refunded: false })
    expect(await account(user)).toMatchObject({ freeLeft: 4 })
  })

  it('returns last month\'s free credits as paid credits', async () => {
    const user = await newUser('oldmonth@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    const created = await createLooks(user, [single(0)])
    await db.query(`update public.looks set created_at = created_at - interval '40 days' where id = $1`, [created.looks[0].id])
    await db.query(`update public.accounts set free_month = free_month - interval '1 month' where user_id = $1`, [user])
    await one(`select public.fail_look($1, 'stale') as r`, [created.looks[0].id])
    expect(await account(user)).toMatchObject({ credits: 1, freeLeft: 5 })
  })
})

describe('UPI recharges', () => {
  it('turns a recharge into credits at its rate', async () => {
    const user = await newUser('rates@example.com')
    expect((await submit(user, 500, '600000000001')).recharge).toMatchObject({ amount_inr: 500, rate_inr: 10, credits: 50, status: 'PENDING' })
    expect((await submit(user, 999 + 1, '600000000002')).recharge).toMatchObject({ rate_inr: 5, credits: 200 })
    expect((await submit(user, 1500, '600000000003')).recharge).toMatchObject({ rate_inr: 5, credits: 300 })
    expect(await submit(user, 155, '600000000004')).toEqual({ error: 'INVALID_AMOUNT_STEP', step: 10 })
    expect(await submit(user, 20, '600000000005')).toMatchObject({ error: 'INVALID_AMOUNT', min: 50 })
    expect(await submit(user, 20000, '600000000006')).toMatchObject({ error: 'INVALID_AMOUNT', max: 10000 })
    expect(await submit(user, 500, '12345')).toEqual({ error: 'INVALID_UTR' })
  })

  it('approves automatically when the bank alert matches, whichever comes first', async () => {
    const user = await newUser('auto@example.com')
    await submit(user, 200, '600000000101')
    expect(await alert('600000000101', 200)).toMatchObject({ outcome: 'MATCHED' })
    expect(await account(user)).toMatchObject({ credits: 20 })
    expect(await alert('600000000101', 200)).toEqual({ outcome: 'DUPLICATE' })

    expect(await alert('600000000102', 1000)).toEqual({ outcome: 'STORED' })
    const late = await submit(user, 1000, '600000000102')
    expect(late.recharge).toMatchObject({ status: 'APPROVED', auto_verified: true, credits: 200 })
    expect(await account(user)).toMatchObject({ credits: 220 })

    // Sending the same UTR again changes nothing.
    expect((await submit(user, 1000, '600000000102')).repeat).toBe(true)
    expect(await account(user)).toMatchObject({ credits: 220 })
  })

  it('leaves a wrong amount for the admin and never credits a UTR twice', async () => {
    const user = await newUser('mismatch@example.com')
    const other = await newUser('other@example.com')
    const { recharge } = await submit(user, 1000, '600000000201')
    expect(await alert('600000000201', 100)).toMatchObject({ outcome: 'AMOUNT_MISMATCH' })
    expect(await account(user)).toMatchObject({ credits: 0 })

    expect(await submit(other, 1000, '600000000201')).toEqual({ error: 'UTR_ALREADY_USED' })

    const admin = await newUser('admin@example.com')
    expect(await one(`select public.review_recharge($1, $2, 'REJECT', 'Bank shows Rs 100') as r`, [recharge.id, admin]))
      .toEqual({ status: 'REJECTED' })
    // After a rejection the customer can send the UTR again with the right
    // amount; the bank alert is already there, so it is approved at once.
    const corrected = await submit(user, 100, '600000000201')
    expect(corrected.recharge).toMatchObject({ status: 'APPROVED', auto_verified: true, credits: 10 })
    expect(await account(user)).toMatchObject({ credits: 10 })
    expect(await one(`select public.review_recharge($1, $2, 'APPROVE', null) as r`, [corrected.recharge.id, admin]))
      .toEqual({ status: 'APPROVED', alreadyReviewed: true })
    expect(await account(user)).toMatchObject({ credits: 10 })

    // Without a bank alert, the admin approves by hand.
    const manual = await submit(user, 300, '600000000202')
    expect(manual.recharge).toMatchObject({ status: 'PENDING', credits: 30 })
    expect(await one(`select public.review_recharge($1, $2, 'APPROVE', null) as r`, [manual.recharge.id, admin]))
      .toEqual({ status: 'APPROVED' })
    expect(await account(user)).toMatchObject({ credits: 40 })
  })

  it('limits pending recharges per person', async () => {
    const user = await newUser('pending@example.com')
    for (let i = 0; i < 5; i += 1) await submit(user, 100, `60000000030${i}`)
    expect(await submit(user, 100, '600000000399')).toEqual({ error: 'TOO_MANY_PENDING' })
  })
})

describe('admin credit adjustments', () => {
  it('finds the person by email and never goes below zero', async () => {
    await newUser('Adjust@Example.com')
    expect(await one(`select public.adjust_credits('adjust@example.com', null, 5, 'Bad picture') as r`)).toEqual({ credits: 5 })
    expect(await one(`select public.adjust_credits('adjust@example.com', null, -9, 'Correction') as r`))
      .toEqual({ error: 'NOT_ENOUGH_CREDITS', credits: 5 })
    expect(await one(`select public.adjust_credits('nobody@example.com', null, 5, 'Gift') as r`)).toEqual({ error: 'USER_NOT_FOUND' })
  })
})

describe('settings', () => {
  it('saves the UPI ID and refuses one that is not a UPI ID', async () => {
    const save = (upiId: string | null) => db.query('update public.app_settings set upi_id = $1 where id', [upiId])
    await save('prworkshop@okaxis')
    await save('inaivuit.62669389@hdfcbank')
    await save(null)
    await expect(save('prworkshop okaxis')).rejects.toThrow(/app_settings_values_check/)
    await expect(save(`${'a'.repeat(250)}@okaxis`)).rejects.toThrow(/app_settings_values_check/)
  })
})

describe('admin numbers', () => {
  it('counts users, pictures, recharges and waiting work', async () => {
    const stats = await one<Record<string, number>>(`select public.admin_stats(now() - interval '1 day') as r`)
    expect(stats.users).toBeGreaterThan(5)
    expect(stats.pendingRecharges).toBeGreaterThan(0)
    expect(stats.rechargedInr).toBeGreaterThanOrEqual(1200)
    expect(stats.autoVerifiedRecharges).toBeGreaterThanOrEqual(2)
    expect(stats).toHaveProperty('aiCostInr')
    expect(stats).toHaveProperty('unmatchedAlerts')
  })
})

describe('mobile numbers', () => {
  const savePhone = (userId: string, phone: string | null, offers: boolean) =>
    one<Result>('select public.save_phone($1, $2, $3) as r', [userId, phone, offers])

  it('saves, changes and removes the number, with offers only when there is one', async () => {
    const user = await newUser('mobile@example.com')
    expect(await account(user)).toMatchObject({ phone: null, offersOk: false, phoneAskedAt: null })

    expect(await savePhone(user, '+919876543210', true)).toMatchObject({ phone: '+919876543210', offersOk: true })
    expect(await savePhone(user, '+919123456780', false)).toMatchObject({ phone: '+919123456780', offersOk: false })
    const removed = await savePhone(user, null, true)
    expect(removed).toMatchObject({ phone: null, offersOk: false })
    expect(removed.phoneAskedAt).toBeTruthy()

    await expect(savePhone(user, '9876543210', false)).rejects.toThrow(/INVALID_PHONE/)
    await expect(savePhone(user, '+914423456789', false)).rejects.toThrow(/INVALID_PHONE/)
  })

  it('remembers "Not now" without touching the number', async () => {
    const user = await newUser('later@example.com')
    const skipped = await one<Result>('select public.skip_phone($1) as r', [user])
    expect(skipped).toMatchObject({ phone: null })
    expect(skipped.phoneAskedAt).toBeTruthy()
  })

  it('shows the number to the admin and finds customers by it', async () => {
    const user = await newUser('findme@example.com')
    await savePhone(user, '+919988776655', true)
    const search = (text: string) => one<{ total: number; users: Array<Record<string, unknown>> }>(
      `select public.admin_users($1, 'recent', 50, 0) as r`, [text])

    for (const text of ['99887 76655', '+91 9988776655', '09988776655', '776655']) {
      const found = await search(text)
      expect(found.users.map(row => row.email), text).toEqual(['findme@example.com'])
      expect(found.users[0]).toMatchObject({ phone: '+919988776655', offersOk: true })
    }
    // Digits inside an email search don't match phone numbers.
    expect((await search('findme@example')).total).toBe(1)
    expect((await search('9')).users.map(row => row.email)).toContain('findme@example.com')

    const detail = await one<{ user: Record<string, unknown> }>('select public.admin_user_detail($1) as r', [user])
    expect(detail.user).toMatchObject({ phone: '+919988776655', offersOk: true })
    expect(detail.user.phoneUpdatedAt).toBeTruthy()
  })
})

describe('database permissions', () => {
  it('lets only the server call the functions and read the tables', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await expect(db.query(`select public.submit_recharge(gen_random_uuid(), 'a', 100, '600000000999')`)).rejects.toThrow(/permission denied/)
        await expect(db.query('select * from public.accounts')).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.adjust_credits('a@b.c', null, 5, 'Free')`)).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.save_phone(gen_random_uuid(), '+919876543210', true)`)).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    }
  })
})
