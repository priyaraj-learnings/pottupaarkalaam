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

// Free credits need a verified mobile number, so new accounts get one of their
// own unless the test is about accounts without one.
let nextPhone = 8000000001
async function newUser(email: string, { verified = true } = {}) {
  const { rows } = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email])
  if (verified) await db.query('select public.verify_phone($1, $2)', [rows[0].id, `+91${nextPhone++}`])
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
    const free = await createLooks(user, [pair(0, 1), single(2)])
    await createLooks(user, [pair(0, 1)])
    expect(await account(user)).toMatchObject({ credits: 0, freeLeft: 0 })
    await db.query(`select public.adjust_credits('refund@example.com', null, 2, 'Test credits')`)
    const paid = await createLooks(user, [pair(0, 1)])
    expect(paid.account).toMatchObject({ credits: 0, freeLeft: 0 })

    const pairLook = paid.looks[0].id
    expect(await one(`select public.fail_look($1, 'Provider error') as r`, [pairLook])).toEqual({ status: 'FAILED', refunded: true })
    expect(await account(user)).toMatchObject({ credits: 2, freeLeft: 0 })
    expect(await one(`select public.fail_look($1, 'Again') as r`, [pairLook])).toEqual({ status: 'FAILED', refunded: true })
    expect(await account(user)).toMatchObject({ credits: 2 })

    // Free credits come back as free credits in the same month.
    await one(`select public.fail_look($1, 'Provider error') as r`, [free.looks[1].id])
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

  it('never turns last month\'s free credits into paid credits', async () => {
    const user = await newUser('oldmonth@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    const created = await createLooks(user, [single(0)])
    await db.query(`update public.looks set created_at = created_at - interval '40 days' where id = $1`, [created.looks[0].id])
    await db.query(`update public.accounts set free_month = free_month - interval '1 month' where user_id = $1`, [user])
    await one(`select public.fail_look($1, 'stale') as r`, [created.looks[0].id])
    expect(await account(user)).toMatchObject({ credits: 0, freeLeft: 5 })
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

describe('free credits for one mobile number', () => {
  const verify = (userId: string, phone: string) => one<Result>('select public.verify_phone($1, $2) as r', [userId, phone])

  it('gives free credits only to accounts with a verified number', async () => {
    const user = await newUser('needs-mobile@example.com', { verified: false })
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    expect(await account(user)).toMatchObject({ freeLeft: 0, phoneVerified: false })
    expect(await createLooks(user, [single(0)])).toMatchObject({ error: 'INSUFFICIENT_CREDITS', available: 0 })
    // Even with the old admin switch off.
    await db.query('update public.app_settings set free_needs_mobile = false where id')
    try {
      expect(await account(user)).toMatchObject({ freeLeft: 0 })
    } finally {
      await db.query('update public.app_settings set free_needs_mobile = true where id')
    }
    // Paid credits work without a number.
    await db.query(`select public.adjust_credits('needs-mobile@example.com', null, 1, 'Gift')`)
    expect((await createLooks(user, [single(0)])).looks).toHaveLength(1)

    expect(await verify(user, '+919000000001')).toMatchObject({ account: { phone: '+919000000001', phoneVerified: true, freeLeft: 5 } })
    expect((await createLooks(user, [single(0)])).looks).toHaveLength(1)
    expect(await account(user)).toMatchObject({ freeLeft: 4 })
  })

  it('lets a verified number belong to one account only', async () => {
    const first = await newUser('first-phone@example.com')
    const second = await newUser('second-phone@example.com')
    await verify(first, '+919000000002')
    expect(await verify(second, '+919000000002')).toEqual({ error: 'PHONE_TAKEN' })
    // The same account can verify it again, or move to a new number.
    expect(await verify(first, '+919000000002')).toHaveProperty('account')
    expect(await verify(first, '+919000000003')).toMatchObject({ account: { phone: '+919000000003' } })
    // The old number is free again for someone else.
    expect(await verify(second, '+919000000002')).toMatchObject({ account: { phoneVerified: true } })
  })

  it('does not give free credits again to a number an account moved away from', async () => {
    const first = await newUser('mover@example.com', { verified: false })
    const second = await newUser('taker@example.com', { verified: false })
    await one('select public.get_account($1, $2) as r', [first, TERMS])
    await verify(first, '+919000000006')
    await createLooks(first, [single(0), single(1)])
    expect(await verify(first, '+919000000007')).toMatchObject({ account: { freeLeft: 3 } })
    expect(await verify(second, '+919000000006')).toMatchObject({ account: { phoneVerified: true, freeLeft: 3 } })
  })

  it('never lets a typed number replace or remove a verified one', async () => {
    const user = await newUser('typed-over@example.com')
    await verify(user, '+919000000004')
    await expect(one('select public.save_phone($1, $2, false) as r', [user, '+919000000005'])).rejects.toThrow(/PHONE_VERIFIED/)
    await expect(one('select public.save_phone($1, null, false) as r', [user])).rejects.toThrow(/PHONE_VERIFIED/)
    // Changing only the offers choice for the same number is fine.
    expect(await one('select public.save_phone($1, $2, true) as r', [user, '+919000000004'])).toMatchObject({ offersOk: true, phoneVerified: true })
  })
})

describe('couple pictures', () => {
  const couple = (userId: string, terms = TERMS) => one<Result>(
    `select public.create_couple_look($1, gen_random_uuid(), 'his.jpg', 'her.jpg', array['his-fabric.jpg','her-fabric.jpg'], now() + interval '3 days', $2, $3::jsonb) as r`,
    [userId, terms, JSON.stringify([
      { index: 0, category: 'FORMAL_SHIRT', source: 'FABRIC', role: 'HIS' },
      { index: 1, category: 'SAREE', source: 'FABRIC', role: 'HER' },
    ])],
  )
  const settings = (enabled: boolean, credits = 3) =>
    db.query('update public.app_settings set couple_enabled = $1, couple_credits = $2 where id', [enabled, credits])
  const optIn = (userId: string, on: boolean) => one<Result>('select public.set_couple_opt_in($1, $2) as r', [userId, on])

  it('is off until the admin turns it on and the customer chooses it', async () => {
    const user = await newUser('couple-off@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    await db.query(`update public.accounts set credits = 10 where user_id = $1`, [user])
    expect(await couple(user)).toEqual({ error: 'COUPLE_OFF' })
    await settings(true)
    try {
      expect(await couple(user)).toEqual({ error: 'COUPLE_OFF' })
      expect(await optIn(user, true)).toMatchObject({ coupleOptIn: true })
      expect(await couple(user)).toHaveProperty('look')
    } finally {
      await settings(false)
    }
  })

  it('uses paid credits only, at the admin price, and gives them back if it fails', async () => {
    const user = await newUser('couple-paid@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    await optIn(user, true)
    await settings(true, 4)
    try {
      // 5 free credits are no use for a couple picture.
      expect(await couple(user)).toMatchObject({ error: 'INSUFFICIENT_CREDITS', needed: 4, available: 0 })
      await db.query(`update public.accounts set credits = 6 where user_id = $1`, [user])
      const made = await couple(user)
      expect(made).toMatchObject({ look: { kind: 'COUPLE', credits: 4 }, account: { credits: 2, freeLeft: 5 } })

      const lookId = (made as unknown as { look: { id: string } }).look.id
      const row = await one<Record<string, unknown>>(`select row_to_json(l) as r from public.looks l where id = $1`, [lookId])
      expect(row).toMatchObject({ kind: 'COUPLE', credits: 4, free_credits_used: 0, paid_credits_used: 4 })
      const batch = await one<Record<string, unknown>>(
        `select row_to_json(b) as r from public.try_on_batches b join public.looks l on l.batch_id = b.id where l.id = $1`, [lookId])
      expect(batch).toMatchObject({ photo_path: 'his.jpg', partner_photo_path: 'her.jpg' })

      await one('select public.fail_look($1, $2) as r', [lookId, 'The picture could not be made.'])
      expect(await account(user)).toMatchObject({ credits: 6, freeLeft: 5 })
    } finally {
      await settings(false)
    }
  })

  it('still asks for the current terms first', async () => {
    const user = await newUser('couple-terms@example.com')
    await optIn(user, true)
    await db.query(`update public.accounts set credits = 10 where user_id = $1`, [user])
    await settings(true)
    try {
      expect(await couple(user)).toEqual({ error: 'TERMS_REQUIRED' })
    } finally {
      await settings(false)
    }
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
    const user = await newUser('mobile@example.com', { verified: false })
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
    const user = await newUser('later@example.com', { verified: false })
    const skipped = await one<Result>('select public.skip_phone($1) as r', [user])
    expect(skipped).toMatchObject({ phone: null })
    expect(skipped.phoneAskedAt).toBeTruthy()
  })

  it('shows the number to the admin and finds customers by it', async () => {
    const user = await newUser('findme@example.com', { verified: false })
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

describe('extra photos for paying customers', () => {
  // Five singles: the 4th and 5th photo (index 3 and 4) are extra.
  const fiveSingles = [single(0), single(1), single(2), single(3), single(4)]

  it('are allowed only after a recharge this month, and cost one more paid credit each', async () => {
    const user = await newUser('extra-photos@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    expect(await account(user)).toMatchObject({ paidThisMonth: false })
    expect(await createLooks(user, fiveSingles)).toEqual({ error: 'EXTRA_PHOTOS_NOT_ALLOWED' })
    // Three photos are fine without paying.
    expect((await createLooks(user, [single(0)])).looks).toHaveLength(1)

    await submit(user, 100, '600000000901')
    await alert('600000000901', 100)
    expect(await account(user)).toMatchObject({ paidThisMonth: true, credits: 10, freeLeft: 4 })

    const made = await createLooks(user, fiveSingles)
    expect(made.looks.map(look => (look as unknown as { credits: number }).credits)).toEqual([1, 1, 1, 2, 2])
    // 4 free credits pay for four normal parts, 1 paid credit for the fifth,
    // and the two extras are paid: 3 paid credits in all.
    expect(await account(user)).toMatchObject({ freeLeft: 0, credits: 7 })
    const fifth = await db.query<{ credits: number; extra_credits: number; free_credits_used: number; paid_credits_used: number }>(
      'select credits, extra_credits, free_credits_used, paid_credits_used from public.looks where id = $1', [made.looks[4].id])
    expect(fifth.rows[0]).toEqual({ credits: 2, extra_credits: 1, free_credits_used: 0, paid_credits_used: 2 })

    // A failed extra picture gives back both its credits.
    await one(`select public.fail_look($1, 'test') as r`, [made.looks[4].id])
    expect(await account(user)).toMatchObject({ credits: 9 })
  })

  it('need paid credits for the extra even when free credits are left', async () => {
    const user = await newUser('extra-free-only@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    await submit(user, 50, '600000000902')
    await alert('600000000902', 50)
    expect(await account(user)).toMatchObject({ credits: 5, freeLeft: 5 })
    // 4 photos: 4 normal parts from free credits, 1 extra from paid credits.
    expect((await createLooks(user, [single(0), single(1), single(2), single(3)])).looks).toHaveLength(4)
    expect(await account(user)).toMatchObject({ credits: 4, freeLeft: 1 })
    // With no paid credits the 4th photo is refused, although a free credit is left.
    await db.query('update public.accounts set credits = 0 where user_id = $1', [user])
    expect(await createLooks(user, [single(0), single(1), single(2), single(3)]))
      .toMatchObject({ error: 'INSUFFICIENT_CREDITS', paidNeeded: 4 })
  })

  it('can be turned off by the admin', async () => {
    const user = await newUser('extra-off@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    await submit(user, 100, '600000000903')
    await alert('600000000903', 100)
    await db.query('update public.app_settings set extra_photos_enabled = false where id')
    try {
      expect(await createLooks(user, fiveSingles)).toEqual({ error: 'EXTRA_PHOTOS_NOT_ALLOWED' })
    } finally {
      await db.query('update public.app_settings set extra_photos_enabled = true where id')
    }
  })
})

describe('deleting an account', () => {
  const verify = (userId: string, phone: string) => one<Result>('select public.verify_phone($1, $2) as r', [userId, phone])
  const deleteAccount = async (userId: string) => {
    await db.query('select public.prepare_account_deletion($1)', [userId])
    await db.query('delete from auth.users where id = $1', [userId])
  }

  it('removes the account, credits and pictures but keeps payment records without the person', async () => {
    const user = await newUser('leaving@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    expect((await createLooks(user, [single(0)])).looks).toHaveLength(1)
    const { recharge } = await submit(user, 100, '600000000601')

    await deleteAccount(user)

    const left = await db.query<{ n: number }>(
      `select (select count(*) from public.accounts where user_id = $1)
            + (select count(*) from public.looks where user_id = $1)
            + (select count(*) from public.try_on_batches where user_id = $1)
            + (select count(*) from public.credit_ledger where user_id = $1) as n`, [user])
    expect(Number(left.rows[0].n)).toBe(0)
    const kept = await db.query('select user_id, user_email, amount_inr, utr from public.recharges where id = $1', [recharge.id])
    expect(kept.rows[0]).toEqual({ user_id: null, user_email: null, amount_inr: 100, utr: '600000000601' })
  })

  it('does not give the same mobile number a second set of free credits in the month', async () => {
    const first = await newUser('first-life@example.com')
    await one('select public.get_account($1, $2) as r', [first, TERMS])
    await verify(first, '+919000000611')
    await createLooks(first, [single(0), single(1)])
    expect(await account(first)).toMatchObject({ freeLeft: 3 })
    await deleteAccount(first)

    const again = await newUser('second-life@example.com')
    await one('select public.get_account($1, $2) as r', [again, TERMS])
    expect(await account(again)).toMatchObject({ freeLeft: 5 })
    expect(await verify(again, '+919000000611')).toMatchObject({ account: { phoneVerified: true, freeLeft: 3 } })

    // Only a one-way code of the number is kept, and only for this month.
    const codes = await db.query<{ phone_hash: string }>('select phone_hash from public.free_use_carryover')
    expect(codes.rows.map(row => row.phone_hash).join()).not.toContain('9000000611')
    await db.query(`update public.free_use_carryover set free_month = free_month - interval '1 month'`)
    expect(await one('select public.purge_free_use_carryover() as r')).toBeGreaterThan(0)
  })
})

describe('website visits', () => {
  const code = (n: number) => n.toString(16).padStart(64, '0')
  const today = async () => (await db.query<{ visitors: number; page_views: number }>(
    `select visitors, page_views from public.site_visit_days where day = (now() at time zone 'Asia/Kolkata')::date`)).rows[0]

  it('counts each visitor once a day and every page view, and keeps only the counts after the day', async () => {
    await db.query('select public.record_site_visit($1)', [code(1)])
    await db.query('select public.record_site_visit($1)', [code(1)])
    await db.query('select public.record_site_visit($1)', [code(2)])
    expect(await today()).toEqual({ visitors: 2, page_views: 3 })

    await db.query(`update public.site_visitors set day = day - 1`)
    expect(await one('select public.purge_site_visitors() as r')).toBe(2)
    expect((await db.query('select count(*)::int as n from public.site_visitors')).rows[0]).toEqual({ n: 0 })
    expect(await today()).toEqual({ visitors: 2, page_views: 3 })
  })

  it('counts a started try-on once a visitor a day, and the visitor too if new', async () => {
    const starts = async () => (await db.query<{ visitors: number; starts: number }>(
      `select visitors, starts from public.site_visit_days where day = (now() at time zone 'Asia/Kolkata')::date`)).rows[0]
    await db.query('delete from public.site_visit_days')
    await db.query('select public.record_site_visit($1)', [code(10)])
    await db.query('select public.record_try_on_start($1)', [code(10)])
    await db.query('select public.record_try_on_start($1)', [code(10)])
    // Straight to a photo without a page view first: a visitor and a start.
    await db.query('select public.record_try_on_start($1)', [code(11)])
    expect(await starts()).toEqual({ visitors: 2, starts: 2 })
  })

  it('refuses anything but a 64-character code', async () => {
    await expect(db.query('select public.record_site_visit($1)', ['203.0.113.9'])).rejects.toThrow()
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
        await expect(db.query(`select public.verify_phone(gen_random_uuid(), '+919876543210')`)).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.set_couple_opt_in(gen_random_uuid(), true)`)).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.prepare_account_deletion(gen_random_uuid())`)).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.paid_this_month(gen_random_uuid())`)).rejects.toThrow(/permission denied/)
        await expect(db.query('select * from public.free_use_carryover')).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.record_site_visit('${'0'.repeat(64)}')`)).rejects.toThrow(/permission denied/)
        await expect(db.query('select * from public.site_visit_days')).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.record_try_on_start('${'0'.repeat(64)}')`)).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    }
  })
})

describe('email choices', () => {
  it('records the email offers tick and the monthly email choice', async () => {
    const user = await newUser('offers@example.com')
    expect(await account(user)).toMatchObject({ emailOffersOk: false, monthlyEmailOk: true })
    expect(await one('select public.set_email_offers($1, true) as r', [user])).toMatchObject({ emailOffersOk: true })
    const { rows } = await db.query<{ at: string | null }>('select email_offers_ok_at as at from public.accounts where user_id = $1', [user])
    expect(rows[0].at).not.toBeNull()
    expect(await one('select public.set_monthly_email($1, false) as r', [user])).toMatchObject({ monthlyEmailOk: false })
  })
})

describe('refer a friend', () => {
  const code = async (userId: string) => (await account(userId)).referralCode as string
  const claim = (userId: string, referral: string) => one<Result>('select public.claim_referral($1, $2) as r', [userId, referral])
  const credits = async (userId: string) => (await account(userId)).credits

  it('gives both 2 credits once the friend verifies a mobile number', async () => {
    const inviter = await newUser('inviter@example.com')
    const friend = await newUser('friend@example.com', { verified: false })
    const inviteCode = await code(inviter)
    expect(inviteCode).toMatch(/^[0-9A-F]{8}$/)
    expect(await claim(friend, inviteCode.toLowerCase())).toEqual({ rewarded: false, reason: 'NOT_VERIFIED' })
    await db.query('select public.verify_phone($1, $2)', [friend, '+919111111111'])
    expect(await one('select public.settle_referral($1) as r', [friend])).toEqual({ rewarded: true, credits: 2 })
    expect(await credits(friend)).toBe(2)
    expect(await credits(inviter)).toBe(2)
    expect(await account(inviter)).toMatchObject({ friendsJoined: 1 })
    // Only once.
    expect(await one('select public.settle_referral($1) as r', [friend])).toEqual({ rewarded: false, reason: 'ALREADY_REWARDED' })
    expect(await claim(friend, inviteCode)).toEqual({ rewarded: false, reason: 'ALREADY_REWARDED' })
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.credit_ledger where kind = 'REFERRAL'`)
    expect(rows[0].n).toBe(2)
  })

  it('refuses own codes, unknown codes and old accounts', async () => {
    const someone = await newUser('self@example.com')
    expect(await claim(someone, await code(someone))).toEqual({ rewarded: false, reason: 'OWN_CODE' })
    expect(await claim(someone, 'NOPE1234')).toEqual({ rewarded: false, reason: 'UNKNOWN_CODE' })
    const old = await newUser('old@example.com')
    await db.query(`update public.accounts set created_at = now() - interval '8 days' where user_id = $1`, [old])
    expect(await claim(old, await code(someone))).toEqual({ rewarded: false, reason: 'NOT_NEW' })
  })

  it('rewards a mobile number once, ever, and stops at the limit', async () => {
    const inviter = await newUser('limit@example.com')
    const inviteCode = await code(inviter)
    const first = await newUser('again1@example.com', { verified: false })
    await claim(first, inviteCode)
    await db.query('select public.verify_phone($1, $2)', [first, '+919222222222'])
    expect(await one('select public.settle_referral($1) as r', [first])).toMatchObject({ rewarded: true })
    // The same number on a new account (after moving the first away).
    await db.query('select public.verify_phone($1, $2)', [first, '+919222222223'])
    const second = await newUser('again2@example.com', { verified: false })
    await db.query('select public.verify_phone($1, $2)', [second, '+919222222222'])
    expect(await claim(second, inviteCode)).toEqual({ rewarded: false, reason: 'NUMBER_USED' })

    await db.query('update public.app_settings set referral_max_per_person = 1 where id')
    try {
      const third = await newUser('again3@example.com')
      expect(await claim(third, inviteCode)).toEqual({ rewarded: false, reason: 'LIMIT' })
    } finally {
      await db.query('update public.app_settings set referral_max_per_person = 10 where id')
    }
  })
})

describe('monthly email', () => {
  it('picks each eligible account once a month', async () => {
    const batch = () => db.query<{ email: string }>('select email from public.take_monthly_email_batch(500)')
    const pick = async () => (await batch()).rows.map(row => row.email)
    const wants = await newUser('monthly@example.com')
    const phone = await newUser('pp-phone-919333333333@inaivuit.com')
    const unverified = await newUser('monthly-unverified@example.com', { verified: false })
    const usedAll = await newUser('monthly-used@example.com')
    const out = await newUser('monthly-out@example.com')
    for (const user of [wants, phone, unverified, usedAll, out]) {
      await one('select public.get_account($1, $2) as r', [user, TERMS])
      await db.query(`update public.accounts set created_at = now() - interval '40 days' where user_id = $1`, [user])
    }
    await db.query(`update public.accounts set free_month = (date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month')::date,
      free_used = 5 where user_id = $1`, [usedAll])
    await db.query('select public.set_monthly_email($1, false)', [out])

    expect(await pick()).toEqual([])
    await db.query('update public.app_settings set monthly_email_enabled = true where id')
    try {
      const emails = await pick()
      expect(emails).toContain('monthly@example.com')
      for (const skipped of ['pp-phone-919333333333@inaivuit.com', 'monthly-unverified@example.com', 'monthly-used@example.com', 'monthly-out@example.com']) {
        expect(emails).not.toContain(skipped)
      }
      expect(await pick()).not.toContain('monthly@example.com')
      // At most 95 a day: with today's sends counted, the rest wait for tomorrow.
      const later = await newUser('monthly-later@example.com')
      await one('select public.get_account($1, $2) as r', [later, TERMS])
      await db.query(`update public.accounts set created_at = now() - interval '40 days' where user_id = $1`, [later])
      expect((await db.query('select email from public.take_monthly_email_batch(500, 1)')).rows).toEqual([])
      await db.query(`update public.accounts set monthly_email_sent_at = now() - interval '2 days' where monthly_email_sent_at is not null`)
      expect((await db.query<{ email: string }>('select email from public.take_monthly_email_batch(500, 1)')).rows.map(row => row.email)).toEqual(['monthly-later@example.com'])
    } finally {
      await db.query('update public.app_settings set monthly_email_enabled = false where id')
    }
  })
})

describe('starter pack', () => {
  it('allows one first recharge of the starter amount, below the smallest recharge', async () => {
    const user = await newUser('starter@example.com')
    expect(await account(user)).toMatchObject({ starterAvailable: true, completedPictures: 0 })
    expect(await submit(user, 25, '700000000001')).toMatchObject({ error: 'INVALID_AMOUNT' })
    await db.query('update public.app_settings set starter_pack_inr = 25, starter_pack_credits = 4 where id')
    try {
      expect((await submit(user, 25, '700000000002')).recharge).toMatchObject({ amount_inr: 25, credits: 4, rate_inr: 7, starter: true })
      expect(await account(user)).toMatchObject({ starterAvailable: false })
      // Only once.
      expect(await submit(user, 25, '700000000003')).toMatchObject({ error: 'INVALID_AMOUNT' })
    } finally {
      await db.query('update public.app_settings set starter_pack_inr = 0, starter_pack_credits = 0 where id')
    }
  })
})

describe('shop posters', () => {
  it('counts new customers from a shop code, without a reward', async () => {
    const { rows } = await db.query<{ code: string }>(`insert into public.shops (name, area) values ('Lakshmi Silks', 'T Nagar') returning code`)
    const shopCode = rows[0].code
    const customer = await newUser('from-shop@example.com')
    expect(await one('select public.claim_referral($1, $2) as r', [customer, shopCode.toLowerCase()]))
      .toEqual({ rewarded: false, reason: 'SHOP', shop: 'Lakshmi Silks' })
    expect((await account(customer)).credits).toBe(0)
    const report = await one<Array<Record<string, unknown>>>('select public.admin_shops() as r')
    expect(report.find(shop => shop.code === shopCode)).toMatchObject({ name: 'Lakshmi Silks', signups: 1, verified: 1, withPictures: 0, paidInr: 0 })
  })
})

describe('compliance', () => {
  it('numbers a receipt for every approved recharge', async () => {
    const user = await newUser('receipt@example.com')
    const { recharge } = await submit(user, 80, '710000000001')
    expect(recharge.receipt_no ?? null).toBeNull()
    await alert('710000000001', 80)
    const { rows } = await db.query<{ receipt_no: string }>('select receipt_no from public.recharges where id = $1', [recharge.id])
    expect(rows[0].receipt_no).toMatch(/^PP-20\d\d-\d{6}$/)
  })

  it('refuses pictures for a blocked account', async () => {
    const user = await newUser('blocked@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    await db.query(`update public.accounts set blocked_at = now(), blocked_reason = 'Test' where user_id = $1`, [user])
    expect(await account(user)).toMatchObject({ blocked: true, blockedReason: 'Test' })
    await expect(createLooks(user, [single(0)])).rejects.toThrow(/ACCOUNT_BLOCKED/)
  })

  it('takes a problem report once and refunds it when the admin agrees', async () => {
    const user = await newUser('problem@example.com')
    await one('select public.get_account($1, $2) as r', [user, TERMS])
    const created = await createLooks(user, [single(0)])
    const lookId = created.looks[0].id
    expect(await one(`select public.report_look_problem($1, $2, 'FACE_CHANGED', 'Not my face') as r`, [user, lookId])).toEqual({ error: 'NOT_FINISHED' })
    await db.query(`update public.looks set status = 'COMPLETED', image_path = 'x.jpg' where id = $1`, [lookId])
    expect(await one(`select public.report_look_problem($1, $2, 'FACE_CHANGED', 'Not my face') as r`, [user, lookId])).toEqual({ reported: true })
    expect(await one(`select public.report_look_problem($1, $2, 'OTHER', '') as r`, [user, lookId])).toEqual({ error: 'ALREADY_REPORTED' })
    const { rows } = await db.query<{ held: boolean }>('select hold_until > now() + interval \'6 days\' as held from public.try_on_batches where id = (select batch_id from public.looks where id = $1)', [lookId])
    expect(rows[0].held).toBe(true)
    expect(await account(user)).toMatchObject({ freeLeft: 4 })
    expect(await one(`select public.resolve_look_problem(null, $1, true, 'Sorry') as r`, [lookId])).toEqual({ resolved: true, refunded: true })
    expect(await account(user)).toMatchObject({ freeLeft: 5 })
    expect(await one(`select public.resolve_look_problem(null, $1, false, '') as r`, [lookId])).toEqual({ error: 'NOT_OPEN' })
    // Someone else cannot report it.
    const other = await newUser('problem-other@example.com')
    expect(await one(`select public.report_look_problem($1, $2, 'OTHER', '') as r`, [other, lookId])).toEqual({ error: 'NOT_FOUND' })
  })

  it('keeps deleted sign-in details 180 days and the usage log a year', async () => {
    await db.query(`insert into public.deleted_registrations (user_id, email, deleted_at) values (gen_random_uuid(), 'old@x.com', now() - interval '181 days'), (gen_random_uuid(), 'new@x.com', now())`)
    await db.query(`insert into public.processing_log (event, created_at) values ('OLD', now() - interval '366 days'), ('NEW', now())`)
    expect(await one('select public.purge_compliance_records() as r')).toEqual({ registrations: 1, log: 1 })
  })
})
