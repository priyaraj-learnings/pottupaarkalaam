'use client'

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { SubTabs, useSubTab, type SubTab } from '@/components/admin/SubTabs'
import type { BlockedPerson, Complaint, LookView, SafetyOverview, SafetyPerson } from '@/components/admin/types'
import { Button, Card, formatWhen, Notice, Spinner, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { categoryLabel, formatMobile } from '@/lib/rules'

// /admin → Safety: complaints, problem reports, finding a picture by its ID,
// blocked accounts and the action log (lib/server/adminSafety.ts).

type Section = 'complaints' | 'problems' | 'find' | 'blocked' | 'log'

const COMPLAINT_LABELS: Record<string, string> = {
  MY_PHOTO_WITHOUT_CONSENT: 'My photo used without consent',
  INTIMATE_OR_SEXUAL: 'Intimate or sexual picture',
  IMPERSONATION: 'Impersonation',
  CHILD: 'Picture of a child',
  PRIVACY_REQUEST: 'Privacy request',
  PAYMENT: 'Payment',
  PICTURE_QUALITY: 'Picture quality',
  OTHER: 'Other',
}

const PROBLEM_LABELS: Record<string, string> = {
  FACE_CHANGED: 'Face changed',
  WRONG_GARMENT: 'Wrong garment',
  DISTORTED: 'Distorted picture',
  OTHER: 'Other',
}

const ACTION_LABELS: Record<string, string> = {
  BLOCK: 'Blocked account',
  UNBLOCK: 'Unblocked account',
  TAKE_DOWN: 'Took picture down',
  HOLD: 'Held as evidence',
  RELEASE_HOLD: 'Released hold',
  PROBLEM_REFUNDED: 'Report: refunded',
  PROBLEM_DECLINED: 'Report: declined',
  COMPLAINT_UPDATED: 'Complaint updated',
}

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-900',
  ACKNOWLEDGED: 'bg-sky-100 text-sky-900',
  RESOLVED: 'bg-emerald-100 text-emerald-900',
}

const HOUR = 3_600_000

function since(iso: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ${minutes % 60} min ago`
  return `${Math.floor(hours / 24)} days ago`
}

function left(deadline: number, now: number) {
  const minutes = Math.round((deadline - now) / 60_000)
  const abs = Math.abs(minutes)
  const text = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)} h ${abs % 60} min` : `${Math.floor(abs / 1440)} days`
  return minutes < 0 ? `overdue by ${text}` : `${text} left`
}

function contactLink(contact: string) {
  const value = contact.trim()
  if (/^\S+@\S+\.\S+$/.test(value)) return <a href={`mailto:${value}`} className="font-semibold text-brand-700 underline">{value}</a>
  const digits = value.replace(/[^\d+]/g, '')
  if (digits.replace(/\D/g, '').length >= 10 && /^[\d+\s()-]+$/.test(value)) return <a href={`tel:${digits}`} className="font-semibold text-brand-700 underline">{value}</a>
  return <span>{value}</span>
}

function PersonLine({ person }: { person: SafetyPerson }) {
  return (
    <span className="text-sm text-stone-700">
      <b className="font-mono">{person.code}</b>
      {person.name && <> · {person.name}</>}
      {person.email && <> · <a href={`mailto:${person.email}`} className="text-brand-700 underline">{person.email}</a></>}
      {person.phone && <> · <a href={`tel:${person.phone}`} className="text-brand-700 underline">{formatMobile(person.phone)}</a></>}
      {person.blocked && <span className="ml-1 rounded-full bg-red-100 px-2 text-xs font-bold text-red-800">Blocked</span>}
    </span>
  )
}

function Pictures({ look, onReload }: { look: LookView; onReload: () => void }) {
  const box = 'flex h-64 w-44 items-center justify-center rounded-xl bg-stone-100 p-2 text-center text-xs text-stone-500 ring-1 ring-stone-200'
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-3">
        <figure className="space-y-1">
          {look.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={look.pictureUrl} alt={`Picture ${look.pictureId}`} className="h-64 w-44 rounded-xl object-cover ring-1 ring-stone-200" />
          ) : <div className={box}>No picture file</div>}
          <figcaption className="text-xs font-bold text-stone-500">Picture</figcaption>
        </figure>
        <figure className="space-y-1">
          {look.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={look.photoUrl} alt="The customer's photo" className="h-64 w-44 rounded-xl object-cover ring-1 ring-stone-200" />
          ) : <div className={box}>{look.photosDeleted ? 'Customer photo already deleted' : 'No customer photo'}</div>}
          <figcaption className="text-xs font-bold text-stone-500">Customer&rsquo;s photo</figcaption>
        </figure>
      </div>
      <p className="text-xs text-stone-500">
        Image links work for 15 minutes.{' '}
        <button type="button" onClick={onReload} className="font-bold text-brand-700 underline">Reload</button>
      </p>
    </div>
  )
}

// A button that opens an inline reason box before acting.
function ReasonAction({ label, confirmLabel, variant = 'secondary', required, placeholder, explain, onConfirm }: {
  label: string
  confirmLabel?: string
  variant?: 'secondary' | 'danger' | 'primary'
  required: boolean
  placeholder: string
  explain?: ReactNode
  onConfirm: (reason: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (required && !reason.trim()) return
    setBusy(true)
    const done = await onConfirm(reason.trim())
    setBusy(false)
    if (done) {
      setOpen(false)
      setReason('')
    }
  }

  if (!open) return <Button variant={variant} onClick={() => setOpen(true)} className="min-h-10 text-sm">{label}</Button>
  return (
    <form onSubmit={submit} className="w-full space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200">
      {explain && <p className="text-xs text-stone-600">{explain}</p>}
      <label className="block text-sm font-bold text-stone-700">
        {required ? 'Reason (required)' : 'Reason (optional)'}
        <input value={reason} onChange={event => setReason(event.target.value)} maxLength={300} required={required} autoFocus
          placeholder={placeholder} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={variant} busy={busy} disabled={required && !reason.trim()} className="min-h-10 text-sm">{confirmLabel ?? label}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy} className="min-h-10 text-sm">Cancel</Button>
      </div>
    </form>
  )
}

type Post = (body: Record<string, unknown>, success: string) => Promise<boolean>

function ComplaintCard({ complaint, now, post, onFind }: { complaint: Complaint; now: number; post: Post; onFind: (id: string) => void }) {
  const [resolving, setResolving] = useState(false)
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState<'' | 'ack' | 'resolve'>('')
  const created = new Date(complaint.created_at).getTime()
  const done = complaint.status === 'RESOLVED'
  const urgentDeadline = created + 2 * HOUR
  const ackDeadline = created + 24 * HOUR
  const resolveDeadline = created + 7 * 24 * HOUR
  const overdue = (deadline: number) => Boolean(now) && now > deadline

  async function act(status: 'ACKNOWLEDGED' | 'RESOLVED') {
    if (status === 'RESOLVED' && !resolution.trim()) return
    setBusy(status === 'RESOLVED' ? 'resolve' : 'ack')
    const ok = await post({ action: 'complaint', id: complaint.id, status, resolution: status === 'RESOLVED' ? resolution.trim() : '' },
      status === 'RESOLVED' ? `${complaint.ticket} resolved.` : `${complaint.ticket} acknowledged.`)
    setBusy('')
    if (ok && status === 'RESOLVED') setResolving(false)
  }

  const urgentOpen = complaint.urgent && !done
  return (
    <li className={`space-y-2 rounded-2xl p-3 ring-1 ${urgentOpen ? 'bg-red-50 ring-red-300' : 'bg-white ring-stone-200'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-mono text-sm">{complaint.ticket}</b>
        {complaint.urgent && <span className="rounded-full bg-red-600 px-2 text-xs font-black text-white">URGENT</span>}
        <span className={`rounded-full px-2 text-xs font-bold ${STATUS_STYLE[complaint.status] ?? 'bg-stone-100'}`}>{complaint.status}</span>
        <span className="text-sm font-bold text-stone-800">{COMPLAINT_LABELS[complaint.category] ?? complaint.category}</span>
        <span className="ml-auto text-xs text-stone-500">{formatWhen(complaint.created_at)}{now ? ` · ${since(complaint.created_at, now)}` : ''}</span>
      </div>

      {!done && now > 0 && (
        complaint.urgent ? (
          <p className={`text-sm font-bold ${overdue(urgentDeadline) ? 'text-red-700' : 'text-red-600'}`}>
            2-hour deadline: by {formatWhen(new Date(urgentDeadline).toISOString())} ({left(urgentDeadline, now)})
          </p>
        ) : (
          <p className="text-xs text-stone-600">
            {complaint.status === 'OPEN' && (
              <span className={overdue(ackDeadline) ? 'font-bold text-red-700' : ''}>
                Acknowledge within 24 hours: by {formatWhen(new Date(ackDeadline).toISOString())} ({left(ackDeadline, now)}).{' '}
              </span>
            )}
            <span className={overdue(resolveDeadline) ? 'font-bold text-red-700' : ''}>
              Resolve within 7 days: by {formatWhen(new Date(resolveDeadline).toISOString())} ({left(resolveDeadline, now)}).
            </span>
          </p>
        )
      )}

      <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-bold text-stone-500">Name</dt><dd>{complaint.name}</dd>
        <dt className="font-bold text-stone-500">Contact</dt><dd>{contactLink(complaint.contact)}</dd>
        {complaint.code && (<><dt className="font-bold text-stone-500">Customer</dt><dd className="font-mono">{complaint.code}</dd></>)}
        {complaint.picture_id && (
          <>
            <dt className="font-bold text-stone-500">Picture ID</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="break-all font-mono text-xs">{complaint.picture_id}</span>
              <button type="button" onClick={() => onFind(complaint.picture_id as string)} className="rounded-lg bg-stone-900 px-2 py-0.5 text-xs font-bold text-white">Find</button>
            </dd>
          </>
        )}
      </dl>
      <p className="whitespace-pre-wrap rounded-xl bg-stone-50 p-2 text-sm text-stone-800 ring-1 ring-stone-100">{complaint.details}</p>
      {complaint.acknowledged_at && <p className="text-xs text-stone-500">Acknowledged {formatWhen(complaint.acknowledged_at)}</p>}
      {complaint.resolved_at && (
        <p className="text-xs text-stone-600">Resolved {formatWhen(complaint.resolved_at)}{complaint.resolution && <>: <span className="whitespace-pre-wrap">{complaint.resolution}</span></>}</p>
      )}

      {!done && (
        resolving ? (
          <div className="space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <label className="block text-sm font-bold text-stone-700">
              What was done (required, kept with the complaint)
              <textarea value={resolution} onChange={event => setResolution(event.target.value)} rows={3} maxLength={2000}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-normal" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button busy={busy === 'resolve'} disabled={!resolution.trim()} onClick={() => void act('RESOLVED')} className="min-h-10 text-sm">Resolve</Button>
              <Button variant="ghost" onClick={() => setResolving(false)} className="min-h-10 text-sm">Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {complaint.status === 'OPEN' && (
              <Button variant="secondary" busy={busy === 'ack'} onClick={() => void act('ACKNOWLEDGED')} className="min-h-10 text-sm">Acknowledge</Button>
            )}
            <Button variant="secondary" onClick={() => setResolving(true)} className="min-h-10 text-sm">Resolve</Button>
          </div>
        )
      )}
    </li>
  )
}

function ProblemCard({ look, post, onReload }: { look: LookView; post: Post; onReload: () => void }) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState<'' | 'refund' | 'decline'>('')
  const problem = look.problem

  async function answer(refund: boolean) {
    setBusy(refund ? 'refund' : 'decline')
    const ok = await post({ action: 'resolveProblem', lookId: look.id, refund, reply: reply.trim() },
      refund ? 'Credits refunded.' : 'Report declined.')
    setBusy('')
    if (ok) setReply('')
  }

  return (
    <li className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">{PROBLEM_LABELS[problem?.reason ?? ''] ?? problem?.reason ?? 'Problem'}</b>
        {problem?.reportedAt && <span className="text-xs text-stone-500">Reported {formatWhen(problem.reportedAt)}</span>}
        <span className="ml-auto break-all font-mono text-xs text-stone-500">{look.pictureId}</span>
      </div>
      <Pictures look={look} onReload={onReload} />
      <p className="text-sm text-stone-700"><b>Garments:</b> {look.garments.map(categoryLabel).join(' + ') || '-'}{look.kind !== 'SINGLE' && <> ({look.kind.toLowerCase()})</>}</p>
      {problem?.note && <p className="whitespace-pre-wrap rounded-xl bg-stone-50 p-2 text-sm ring-1 ring-stone-100">{problem.note}</p>}
      <p><PersonLine person={look.owner} /></p>
      <label className="block text-sm font-bold text-stone-700">
        Reply to the customer (optional)
        <textarea value={reply} onChange={event => setReply(event.target.value)} rows={2} maxLength={500}
          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-normal" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy === 'refund'} disabled={Boolean(busy)} onClick={() => void answer(true)} className="min-h-10 text-sm">Refund credits</Button>
        <Button variant="danger" busy={busy === 'decline'} disabled={Boolean(busy)} onClick={() => void answer(false)} className="min-h-10 text-sm">Decline</Button>
      </div>
    </li>
  )
}

function PictureDetails({ look, post, onReload }: { look: LookView; post: Post; onReload: () => void }) {
  return (
    <div className="space-y-3">
      <Pictures look={look} onReload={onReload} />
      <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-bold text-stone-500">Picture ID</dt><dd className="break-all font-mono text-xs">{look.pictureId}</dd>
        <dt className="font-bold text-stone-500">Owner</dt><dd><PersonLine person={look.owner} /></dd>
        <dt className="font-bold text-stone-500">Made</dt><dd>{formatWhen(look.createdAt)} ({new Date(look.createdAt).getFullYear()})</dd>
        <dt className="font-bold text-stone-500">Status</dt><dd>{look.status}{look.kind !== 'SINGLE' && ` · ${look.kind.toLowerCase()}`}</dd>
        <dt className="font-bold text-stone-500">Garments</dt><dd>{look.garments.map(categoryLabel).join(' + ') || '-'}</dd>
        {look.removedAt && (
          <><dt className="font-bold text-red-700">Taken down</dt><dd className="text-red-800">{formatWhen(look.removedAt)}{look.removedReason && `: ${look.removedReason}`}</dd></>
        )}
        {look.holdUntil && (
          <><dt className="font-bold text-stone-500">Held until</dt><dd>{new Date(look.holdUntil as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{look.holdReason && ` (${look.holdReason})`}</dd></>
        )}
        {look.problem && (
          <>
            <dt className="font-bold text-stone-500">Problem report</dt>
            <dd>
              {PROBLEM_LABELS[look.problem.reason ?? ''] ?? look.problem.reason} · {look.problem.status}
              {look.problem.reportedAt && ` · ${formatWhen(look.problem.reportedAt)}`}
              {look.problem.note && <span className="block whitespace-pre-wrap text-stone-600">Note: {look.problem.note}</span>}
              {look.problem.reply && <span className="block whitespace-pre-wrap text-stone-600">Our reply: {look.problem.reply}</span>}
            </dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {!look.removedAt && (
          <ReasonAction label="Take down" variant="danger" required placeholder="e.g. complaint PPC-… (intimate picture)"
            explain="The customer no longer sees or downloads this picture. The files are kept for 180 days as evidence, then deleted."
            onConfirm={reason => post({ action: 'takeDown', lookId: look.id, reason }, 'Picture taken down.')} />
        )}
        <ReasonAction label="Hold as evidence (180 days)" required placeholder="e.g. police request, complaint PPC-…"
          explain="The picture and the customer's photo are not deleted for 180 days from now."
          onConfirm={reason => post({ action: 'hold', lookId: look.id, reason }, 'Held for 180 days.')} />
        {look.holdUntil && (
          <ReasonAction label="Release hold" required={false} placeholder="Why the hold is no longer needed"
            explain="The files are then deleted on the normal schedule."
            onConfirm={reason => post({ action: 'releaseHold', lookId: look.id, reason }, 'Hold released.')} />
        )}
        {look.owner.blocked ? (
          <ReasonAction label="Unblock account" required={false} placeholder="Why the account is unblocked"
            onConfirm={reason => post({ action: 'unblock', userId: look.owner.userId, reason }, 'Account unblocked.')} />
        ) : (
          <ReasonAction label="Block account" variant="danger" required placeholder="The customer sees this reason"
            explain="The customer can no longer make pictures. They see the reason you write."
            onConfirm={reason => post({ action: 'block', userId: look.owner.userId, reason }, 'Account blocked.')} />
        )}
      </div>
    </div>
  )
}

function BlockedRow({ person, post }: { person: BlockedPerson; post: Post }) {
  return (
    <li className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
      <PersonLine person={person} />
      <p className="text-sm text-stone-700">Blocked {formatWhen(person.blockedAt)}{person.reason && <>: {person.reason}</>}</p>
      <ReasonAction label="Unblock" required={false} placeholder="Why the account is unblocked"
        onConfirm={reason => post({ action: 'unblock', userId: person.userId, reason }, 'Account unblocked.')} />
    </li>
  )
}

const openCount = (data: SafetyOverview) => data.problems.length + data.complaints.filter(item => item.status !== 'RESOLVED').length

export default function SafetyTab({ active, onCount }: { active: boolean; onCount?: (count: number) => void }) {
  const toast = useToast()
  const [data, setData] = useState<SafetyOverview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(0)
  const [query, setQuery] = useState('')
  const [picture, setPicture] = useState<LookView | null>(null)
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState('')

  const show = useCallback((next: SafetyOverview) => {
    setData(next)
    onCount?.(openCount(next))
  }, [onCount])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      show(await api<SafetyOverview>('/api/admin/safety'))
      setLoadError('')
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [show])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const timer = setInterval(() => void load(), 120_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [load])

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [active, load])

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0)
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])

  const find = useCallback(async (value: string, quiet = false) => {
    const id = value.trim()
    if (!id) return
    setFinding(true)
    try {
      const result = await api<{ picture: LookView }>(`/api/admin/safety?picture=${encodeURIComponent(id)}`)
      setPicture(result.picture)
      setFindError('')
    } catch (error) {
      if (!quiet) {
        setPicture(null)
        setFindError(errorMessage(error))
      }
    } finally {
      setFinding(false)
    }
  }, [])

  const post: Post = useCallback(async (body, success) => {
    try {
      show(await api<SafetyOverview>('/api/admin/safety', { method: 'POST', json: body }))
      toast(success)
      if (picture && (body.lookId === picture.id || body.userId === picture.owner.userId)) void find(picture.id, true)
      return true
    } catch (error) {
      toast(errorMessage(error), 'error')
      return false
    }
  }, [show, toast, picture, find])

  const complaints = [...(data?.complaints ?? [])].sort((a, b) =>
    Number(a.status === 'RESOLVED') - Number(b.status === 'RESOLVED') || b.created_at.localeCompare(a.created_at))
  const unresolved = complaints.filter(item => item.status !== 'RESOLVED').length

  const tabs: ReadonlyArray<SubTab<Section>> = [
    { id: 'complaints', label: 'Complaints', badge: unresolved },
    { id: 'problems', label: 'Problem reports', badge: data?.problems.length ?? 0 },
    { id: 'find', label: 'Find a picture' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'log', label: 'Action log' },
  ]
  const [section, setSection] = useSubTab<Section>('admin-safety-tab', tabs)

  const openFind = (id: string) => {
    setQuery(id)
    setSection('find')
    void find(id)
  }

  const reloadPicture = () => {
    if (picture) void find(picture.id, true)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Complaints: acknowledge within 24 hours, resolve within 7 days; sexual, intimate, impersonation and child pictures
        within 2 hours (IT Rules 2021). Telegram alerts for new complaints and reports go to the chat set in Settings.
      </p>
      <SubTabs tabs={tabs} active={section} onChange={setSection} label="Safety sections" />

      {loadError && !data && (
        <Notice tone="error">
          <b>Could not load this page.</b> {loadError}{' '}
          <button type="button" onClick={() => void load()} className="font-extrabold underline">Try again</button>
        </Notice>
      )}
      {!data && !loadError && section !== 'find' && <div className="flex justify-center py-10"><Spinner className="h-6 w-6" /></div>}

      {data && section === 'complaints' && (
        <Card title={<span className="flex items-center gap-2">Complaints {loading && <Spinner />}</span>}>
          {complaints.length === 0 ? <p className="text-sm text-stone-500">No complaints.</p> : (
            <ul className="space-y-3">
              {complaints.map(item => <ComplaintCard key={item.id} complaint={item} now={now} post={post} onFind={openFind} />)}
            </ul>
          )}
        </Card>
      )}

      {data && section === 'problems' && (
        <Card title={<span className="flex items-center gap-2">Problem reports {loading && <Spinner />}</span>}>
          <p className="mb-3 text-xs text-stone-500">Open reports, oldest first. <button type="button" onClick={() => void load()} className="font-bold text-brand-700 underline">Reload</button></p>
          {data.problems.length === 0 ? <p className="text-sm text-stone-500">No open problem reports.</p> : (
            <ul className="space-y-3">
              {data.problems.map(look => <ProblemCard key={look.id} look={look} post={post} onReload={() => void load()} />)}
            </ul>
          )}
        </Card>
      )}

      {section === 'find' && (
        <Card title="Find a picture">
          <form onSubmit={event => { event.preventDefault(); void find(query) }} className="mb-4 flex flex-wrap items-end gap-2">
            <label className="block min-w-0 flex-1 text-sm font-bold text-stone-700">
              Picture ID (pp-…)
              <input value={query} onChange={event => setQuery(event.target.value)} spellCheck={false} placeholder="pp-1a2b3c4d-…"
                className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-mono text-sm font-normal" />
            </label>
            <Button type="submit" busy={finding} disabled={!query.trim()} className="min-h-11 text-sm">Find</Button>
          </form>
          {findError && <Notice tone="error">{findError}</Notice>}
          {picture && <PictureDetails look={picture} post={post} onReload={reloadPicture} />}
        </Card>
      )}

      {data && section === 'blocked' && (
        <Card title="Blocked accounts">
          {data.blocked.length === 0 ? <p className="text-sm text-stone-500">No blocked accounts.</p> : (
            <ul className="space-y-3">{data.blocked.map(person => <BlockedRow key={person.userId} person={person} post={post} />)}</ul>
          )}
        </Card>
      )}

      {data && section === 'log' && (
        <Card title="Action log (last 50)">
          {data.log.length === 0 ? <p className="text-sm text-stone-500">No actions yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-stone-500">
                  <tr><th className="py-1 pr-3">Time</th><th className="py-1 pr-3">Action</th><th className="py-1 pr-3">Customer</th><th className="py-1">Reason</th></tr>
                </thead>
                <tbody>
                  {data.log.map(row => (
                    <tr key={row.id} className="border-t border-stone-100 align-top">
                      <td className="whitespace-nowrap py-1.5 pr-3">{formatWhen(row.created_at)}</td>
                      <td className="whitespace-nowrap py-1.5 pr-3 font-semibold">{ACTION_LABELS[row.action] ?? row.action}</td>
                      <td className="whitespace-nowrap py-1.5 pr-3 font-mono">
                        {row.code ?? '-'}
                        {row.look_id && (
                          <button type="button" onClick={() => openFind(row.look_id as string)} className="ml-2 font-sans text-xs font-bold text-brand-700 underline">Picture</button>
                        )}
                      </td>
                      <td className="py-1.5 text-stone-700">{row.reason ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
