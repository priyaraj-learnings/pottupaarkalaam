'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { downloadCsv, money, type CustomerDetail, type CustomerRow } from '@/components/admin/types'
import { Button, formatWhen, Notice, Sheet, Spinner, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { categoryLabel, formatMobile, isPhoneLoginEmail } from '@/lib/rules'
import { customerCode } from '@/lib/upi'

const SORTS = [
  { value: 'recent', label: 'Newest' },
  { value: 'active', label: 'Recently active' },
  { value: 'paid', label: 'Paid most' },
  { value: 'pictures', label: 'Most pictures' },
] as const

type Page = { total: number; users: CustomerRow[]; page: number; pageSize: number }

const STATUS_LABEL = { APPROVED: 'Added', PENDING: 'Checking', REJECTED: 'Rejected' } as const

// Every customer matching the search, 200 at a time.
async function exportCustomers(search: string, sort: string) {
  const users: CustomerRow[] = []
  for (let page = 0; page <= 1000; page += 1) {
    const params = new URLSearchParams({ search, sort, page: String(page), size: '200' })
    const result = await api<Page>(`/api/admin/customers?${params}`)
    users.push(...result.users)
    if (!result.users.length || users.length >= result.total) break
  }
  downloadCsv('pottupaarkalaam-customers.csv',
    ['Name', 'Email', 'Mobile (+91)', 'Offers OK', 'Customer code', 'Joined', 'Last picture', 'Paid (Rs)', 'Pictures', 'Paid credits left'],
    users.map(user => [
      user.name, isPhoneLoginEmail(user.email) ? '' : user.email, user.phone ? formatMobile(user.phone) : '', user.phone ? (user.offersOk ? 'yes' : 'no') : '',
      customerCode(user.userId), user.joinedAt, user.lastPictureAt ?? '', user.paidInr, user.pictures, user.credits,
    ]))
  return users.length
}

// A person's name, else their mobile number for a mobile sign-in, else email.
function customerName(user: { name: string | null; email: string | null; phone: string | null }) {
  if (user.name) return user.name
  if (isPhoneLoginEmail(user.email)) return user.phone ? `+91 ${formatMobile(user.phone)}` : 'Mobile sign-in'
  return user.email ?? 'Customer'
}

function MobileLine({ phone, offersOk }: { phone: string | null; offersOk: boolean }) {
  if (!phone) return <p className="text-xs text-stone-500">No mobile number</p>
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-semibold tabular-nums">+91 {formatMobile(phone)}</span>
      <a href={`tel:${phone}`} className="font-bold text-brand-700 underline">Call</a>
      <a href={`https://wa.me/${phone.replace('+', '')}`} target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline">WhatsApp</a>
      <span className="text-xs text-stone-500">{offersOk ? 'Agreed to offers' : 'No offers'}</span>
    </p>
  )
}

function Figure({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`font-extrabold tabular-nums ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : 'text-stone-900'}`}>{value}</p>
    </div>
  )
}

function GiveCredits({ email, onDone }: { email: string; onDone: () => void }) {
  const toast = useToast()
  const [credits, setCredits] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function give(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ credits: number }>('/api/admin/credits', { method: 'POST', json: { email, credits: Number(credits), reason } })
      toast(`Done. They now have ${result.credits} paid credits.`)
      setCredits('')
      setReason('')
      onDone()
    } catch (giveError) {
      toast(errorMessage(giveError), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={give} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-2">
      <input required inputMode="numeric" value={credits} onChange={event => setCredits(event.target.value.replace(/[^\d-]/g, ''))}
        placeholder="Credits" aria-label="Credits to give (minus takes back)" className="min-h-10 w-full min-w-0 rounded-xl border border-stone-300 px-3" />
      <input required value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason" aria-label="Reason"
        className="min-h-10 w-full min-w-0 rounded-xl border border-stone-300 px-3" />
      <Button type="submit" busy={busy} className="min-h-10 text-sm">Give</Button>
    </form>
  )
}

function CustomerSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (id: string) => {
    try {
      setDetail(await api<CustomerDetail>(`/api/admin/customers/${id}`))
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const timer = setTimeout(() => load(userId), 0)
    return () => clearTimeout(timer)
  }, [userId, load])

  const shown = detail && detail.user.userId === userId ? detail : null
  const earned = shown ? shown.totals.paidInr - shown.totals.aiCostInr : 0

  return (
    <Sheet open={Boolean(userId)} title={shown ? customerName(shown.user) : 'Customer'} onClose={onClose}>
      {error && <Notice tone="error">{error}</Notice>}
      {!shown && !error && <div className="flex justify-center py-10 text-brand-600"><Spinner className="h-6 w-6" /></div>}
      {shown && (
        <div className="space-y-5 text-sm">
          <div>
            <p className="font-semibold">{isPhoneLoginEmail(shown.user.email) ? 'Signed in with mobile number' : shown.user.email}</p>
            <MobileLine phone={shown.user.phone} offersOk={shown.user.offersOk} />
            <p className="text-xs text-stone-500">
              Code {customerCode(shown.user.userId)} · {isPhoneLoginEmail(shown.user.email) ? 'mobile' : shown.user.provider ?? 'email'} · joined {formatWhen(shown.user.joinedAt)}
              {shown.user.lastSignInAt ? ` · last sign-in ${formatWhen(shown.user.lastSignInAt)}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-stone-50 p-3">
            <Figure label="Paid" value={money(shown.totals.paidInr)} />
            <Figure label="AI cost" value={money(shown.totals.aiCostInr)} />
            <Figure label="Earned" value={money(earned)} tone={earned >= 0 ? 'good' : 'bad'} />
            <Figure label="Pictures" value={shown.totals.pictures} />
            <Figure label="Paid credits left" value={shown.user.credits} />
            <Figure label="Free left" value={shown.user.freeLeft} />
          </div>

          {shown.user.email && (
            <section>
              <h3 className="mb-2 font-extrabold">Give or take back credits</h3>
              <GiveCredits email={shown.user.email} onDone={() => load(shown.user.userId)} />
            </section>
          )}

          <section>
            <h3 className="mb-1 font-extrabold">Recharges ({shown.recharges.length})</h3>
            {shown.recharges.length === 0 ? <p className="text-stone-500">None yet.</p> : (
              <ul className="divide-y divide-stone-100">
                {shown.recharges.map(recharge => (
                  <li key={recharge.id} className="flex justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <b>{money(recharge.amountInr)}</b> → {recharge.credits} credits ({money(recharge.rateInr)} each)
                      <span className="block truncate text-xs text-stone-500">{formatWhen(recharge.createdAt)} · UTR {recharge.utr}{recharge.rejectionReason ? ` · ${recharge.rejectionReason}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold">{STATUS_LABEL[recharge.status]}{recharge.autoVerified ? ' (auto)' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 font-extrabold">Pictures ({shown.pictures.length})</h3>
            {shown.pictures.length === 0 ? <p className="text-stone-500">None yet.</p> : (
              <ul className="divide-y divide-stone-100">
                {shown.pictures.map(picture => (
                  <li key={picture.id} className="flex justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <b>{picture.kind === 'COUPLE' && 'Couple: '}{picture.garments.map(garment => categoryLabel(garment.category)).join(' + ')}</b>
                      <span className="text-stone-500"> · {picture.garments.map(garment => (garment.source === 'FABRIC' ? 'fabric' : 'stitched')).join(' + ')}</span>
                      <span className="block truncate text-xs text-stone-500">
                        {formatWhen(picture.createdAt)} · {picture.freeCreditsUsed} free + {picture.paidCreditsUsed} paid credit{picture.credits === 1 ? '' : 's'}
                        {picture.status === 'FAILED' ? ` · failed${picture.refunded ? ', refunded' : ''}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-stone-600">{picture.status === 'COMPLETED' ? money(picture.aiCostInr) : picture.status.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 font-extrabold">Credit history</h3>
            <ul className="divide-y divide-stone-100">
              {shown.ledger.map((entry, index) => (
                <li key={index} className="flex justify-between gap-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate">{formatWhen(entry.createdAt)} · {entry.kind.toLowerCase().replace('_', ' ')}{entry.reason ? ` · ${entry.reason}` : ''}</span>
                  <span className="shrink-0 tabular-nums">
                    {entry.credits !== 0 && `${entry.credits > 0 ? '+' : ''}${entry.credits} paid `}
                    {entry.freeCredits !== 0 && `${entry.freeCredits > 0 ? '+' : ''}${entry.freeCredits} free `}
                    = {entry.balanceAfter}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  )
}

export default function Customers({ active }: { active: boolean }) {
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]['value']>('recent')
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  // Search after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(async (pageNumber: number) => {
    setBusy(true)
    try {
      const params = new URLSearchParams({ search: query, sort, page: String(pageNumber) })
      const result = await api<Page>(`/api/admin/customers?${params}`)
      setRows(current => (pageNumber === 0 ? result.users : [...current, ...result.users]))
      setTotal(result.total)
      setPage(pageNumber)
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setBusy(false)
    }
  }, [query, sort])

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => load(0), 0)
    return () => clearTimeout(timer)
  }, [active, load])

  async function exportAll() {
    setExporting(true)
    try {
      const count = await exportCustomers(query, sort)
      toast(`Exported ${count} customer${count === 1 ? '' : 's'}.`)
    } catch (exportError) {
      toast(errorMessage(exportError), 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search email, name or mobile"
          aria-label="Search customers" className="min-h-10 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3" />
        <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} aria-label="Sort"
          className="min-h-10 rounded-xl border border-stone-300 bg-white px-3 font-semibold">
          {SORTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <Button variant="secondary" busy={exporting} disabled={!total} onClick={exportAll} className="min-h-10 text-sm">Export CSV</Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {total !== null && <p className="text-sm text-stone-500">{total.toLocaleString('en-IN')} customer{total === 1 ? '' : 's'}</p>}

      <ul className="space-y-2">
        {rows.map(row => (
          <li key={row.userId}>
            <button type="button" onClick={() => setOpenId(row.userId)} className="w-full rounded-2xl bg-white p-3 text-left ring-1 ring-stone-200 hover:ring-brand-200">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="min-w-0 truncate font-bold">
                  {row.name ? `${row.name} · ` : ''}<span className="font-semibold text-stone-600">{isPhoneLoginEmail(row.email) ? '📱 mobile sign-in' : row.email}</span>
                  {row.phone && <span className="font-semibold tabular-nums text-stone-600"> · {formatMobile(row.phone)}</span>}
                </p>
                <p className="text-xs text-stone-500">
                  Joined {formatWhen(row.joinedAt)}{row.lastPictureAt ? ` · last picture ${formatWhen(row.lastPictureAt)}` : ''}
                  {row.pendingRecharges ? ` · ${row.pendingRecharges} waiting` : ''}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Figure label="Paid" value={money(row.paidInr)} />
                <Figure label="AI cost" value={money(row.aiCostInr)} />
                <Figure label="Earned" value={money(row.earnedInr)} tone={row.earnedInr >= 0 ? 'good' : 'bad'} />
                <Figure label="Pictures" value={row.pictures} />
                <Figure label="Credits left" value={row.credits} />
                <Figure label="Free left" value={row.freeLeft} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      {total === 0 && !busy && <p className="py-8 text-center text-sm text-stone-500">No customers found.</p>}
      {busy && <div className="flex justify-center py-4 text-brand-600"><Spinner className="h-6 w-6" /></div>}
      {total !== null && rows.length < total && !busy && (
        <Button variant="secondary" onClick={() => load(page + 1)} className="w-full">Show more</Button>
      )}
      <CustomerSheet userId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
