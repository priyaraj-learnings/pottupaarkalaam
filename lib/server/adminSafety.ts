import 'server-only'

import type { SignedInUser } from '@/lib/server/auth'
import { ApiError, dbError, UUID } from '@/lib/server/http'
import { isPhoneLoginEmail } from '@/lib/rules'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { customerCode } from '@/lib/upi'

// =======================================================
// /admin → Safety: problem reports, complaints, finding a
// picture by its ID (the "pp-…" inside every picture file and
// on its label's metadata), taking it down, blocking an account
// and holding evidence for 180 days (IT Rules 2021, rules
// 3(1)(c), 3(1)(g) and 3(2)). Every action is logged.
// =======================================================

const BUCKET = 'try-on-photos'
const EVIDENCE_DAYS = 180

type Person = { userId: string; code: string; email: string | null; phone: string | null; name: string | null; blocked: boolean }

async function person(userId: string): Promise<Person> {
  const [{ data: user }, { data: account }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from('accounts').select('phone, blocked_at').eq('user_id', userId).maybeSingle(),
  ])
  const email = user?.user?.email ?? null
  const meta = (user?.user?.user_metadata ?? {}) as Record<string, unknown>
  return {
    userId,
    code: customerCode(userId),
    email: isPhoneLoginEmail(email) ? null : email,
    phone: (account?.phone as string | null) ?? null,
    name: typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null,
    blocked: Boolean(account?.blocked_at),
  }
}

async function signedUrl(path: string | null) {
  if (!path) return null
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 15 * 60)
  return data?.signedUrl ?? null
}

type LookRow = {
  id: string; user_id: string; batch_id: string; kind: string; status: string; image_path: string | null; created_at: string
  removed_at: string | null; removed_reason: string | null; garments: Array<{ category: string }>
  problem_reason: string | null; problem_note: string | null; problem_reported_at: string | null; problem_status: string | null; problem_reply: string | null
  try_on_batches: { photo_path: string | null; purged_at: string | null; hold_until: string | null; hold_reason: string | null } | null
}

const LOOK_SELECT = 'id, user_id, batch_id, kind, status, image_path, created_at, removed_at, removed_reason, garments, problem_reason, problem_note, problem_reported_at, problem_status, problem_reply, try_on_batches(photo_path, purged_at, hold_until, hold_reason)'

async function lookView(row: LookRow) {
  const batch = row.try_on_batches
  const [picture, photo, owner] = await Promise.all([signedUrl(row.image_path), signedUrl(batch?.photo_path ?? null), person(row.user_id)])
  return {
    id: row.id, pictureId: `pp-${row.id}`, kind: row.kind, status: row.status, createdAt: row.created_at,
    garments: (row.garments ?? []).map(garment => garment.category),
    pictureUrl: picture, photoUrl: photo, photosDeleted: Boolean(batch?.purged_at),
    removedAt: row.removed_at, removedReason: row.removed_reason,
    holdUntil: batch?.hold_until ?? null, holdReason: batch?.hold_reason ?? null,
    problem: row.problem_status ? { reason: row.problem_reason, note: row.problem_note, reportedAt: row.problem_reported_at, status: row.problem_status, reply: row.problem_reply } : null,
    owner,
  }
}

// "pp-<uuid>", a bare uuid, or text containing one.
export function pictureIdFrom(query: string) {
  return query.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() ?? null
}

export async function findPicture(query: string) {
  const id = pictureIdFrom(query)
  if (!id) throw new ApiError(400, 'INVALID_INPUT', 'Paste the picture ID (it looks like pp-1a2b3c4d-…).')
  const { data, error } = await supabaseAdmin.from('looks').select(LOOK_SELECT).eq('id', id).maybeSingle()
  if (error) throw dbError(error, 'Unable to find the picture')
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'No picture with this ID. It may never have existed here, or its account was deleted.')
  return lookView(data as unknown as LookRow)
}

export async function safetyOverview() {
  const [problems, complaints, blocked, log] = await Promise.all([
    supabaseAdmin.from('looks').select(LOOK_SELECT).eq('problem_status', 'OPEN').order('problem_reported_at', { ascending: true }).limit(50),
    supabaseAdmin.from('grievances').select('id, ticket, user_id, name, contact, category, picture_id, details, urgent, status, acknowledged_at, resolved_at, resolution, created_at')
      .order('status', { ascending: true }).order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('accounts').select('user_id, blocked_at, blocked_reason').not('blocked_at', 'is', null).order('blocked_at', { ascending: false }).limit(100),
    supabaseAdmin.from('moderation_log').select('id, action, user_id, look_id, reason, created_at').order('created_at', { ascending: false }).limit(50),
  ])
  for (const result of [problems, complaints, blocked, log]) if (result.error) throw dbError(result.error, 'Unable to load the safety page')
  return {
    problems: await Promise.all(((problems.data ?? []) as unknown as LookRow[]).map(lookView)),
    complaints: (complaints.data ?? []).map(row => ({ ...row, code: row.user_id ? customerCode(row.user_id as string) : null })),
    blocked: await Promise.all((blocked.data ?? []).map(async row => ({ ...(await person(row.user_id as string)), blockedAt: row.blocked_at, reason: row.blocked_reason }))),
    log: (log.data ?? []).map(row => ({ ...row, code: row.user_id ? customerCode(row.user_id as string) : null })),
  }
}

async function record(admin: SignedInUser, action: string, userId: string | null, lookId: string | null, reason: string | null) {
  const { error } = await supabaseAdmin.from('moderation_log').insert({ admin_id: admin.id, action, user_id: userId, look_id: lookId, reason })
  if (error) throw dbError(error, 'Unable to log the action')
}

const reasonText = (value: unknown, required: string | null) => {
  const reason = typeof value === 'string' ? value.trim().slice(0, 300) : ''
  if (!reason && required) throw new ApiError(400, 'INVALID_INPUT', required)
  return reason || null
}

async function lookRow(lookId: unknown) {
  if (typeof lookId !== 'string' || !UUID.test(lookId)) throw new ApiError(400, 'INVALID_INPUT', 'Unknown picture.')
  const { data, error } = await supabaseAdmin.from('looks').select('id, user_id, batch_id').eq('id', lookId).maybeSingle()
  if (error) throw dbError(error, 'Unable to load the picture')
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Picture not found.')
  return data as { id: string; user_id: string; batch_id: string }
}

async function holdBatch(batchId: string, days: number, reason: string) {
  const until = new Date(Date.now() + days * 86_400_000).toISOString()
  const { error } = await supabaseAdmin.from('try_on_batches').update({ hold_until: until, hold_reason: reason }).eq('id', batchId)
  if (error) throw dbError(error, 'Unable to hold the photos')
}

// {"action": "block" | "unblock" | "takeDown" | "hold" | "releaseHold" | "resolveProblem" | "complaint", ...}
export async function safetyAction(admin: SignedInUser, body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>
  switch (input.action) {
    case 'block': {
      const userId = typeof input.userId === 'string' && UUID.test(input.userId) ? input.userId : null
      if (!userId) throw new ApiError(400, 'INVALID_INPUT', 'Unknown customer.')
      const reason = reasonText(input.reason, 'Write why the account is blocked (the customer sees it).')
      const { error } = await supabaseAdmin.from('accounts').update({ blocked_at: new Date().toISOString(), blocked_reason: reason }).eq('user_id', userId)
      if (error) throw dbError(error, 'Unable to block the account')
      await record(admin, 'BLOCK', userId, null, reason)
      break
    }
    case 'unblock': {
      const userId = typeof input.userId === 'string' && UUID.test(input.userId) ? input.userId : null
      if (!userId) throw new ApiError(400, 'INVALID_INPUT', 'Unknown customer.')
      const { error } = await supabaseAdmin.from('accounts').update({ blocked_at: null, blocked_reason: null }).eq('user_id', userId)
      if (error) throw dbError(error, 'Unable to unblock the account')
      await record(admin, 'UNBLOCK', userId, null, reasonText(input.reason, null))
      break
    }
    case 'takeDown': {
      // The customer no longer sees or downloads it; the files are kept 180 days as evidence.
      const look = await lookRow(input.lookId)
      const reason = reasonText(input.reason, 'Write why the picture is taken down.')
      const { error } = await supabaseAdmin.from('looks').update({ removed_at: new Date().toISOString(), removed_reason: reason }).eq('id', look.id)
      if (error) throw dbError(error, 'Unable to take the picture down')
      await holdBatch(look.batch_id, EVIDENCE_DAYS, `Taken down: ${reason}`.slice(0, 300))
      await record(admin, 'TAKE_DOWN', look.user_id, look.id, reason)
      break
    }
    case 'hold': {
      const look = await lookRow(input.lookId)
      const reason = reasonText(input.reason, 'Write why the photos are held (e.g. police request, complaint PPC-…).')
      await holdBatch(look.batch_id, EVIDENCE_DAYS, reason as string)
      await record(admin, 'HOLD', look.user_id, look.id, reason)
      break
    }
    case 'releaseHold': {
      const look = await lookRow(input.lookId)
      const { error } = await supabaseAdmin.from('try_on_batches').update({ hold_until: null, hold_reason: null }).eq('id', look.batch_id)
      if (error) throw dbError(error, 'Unable to release the hold')
      await record(admin, 'RELEASE_HOLD', look.user_id, look.id, reasonText(input.reason, null))
      break
    }
    case 'resolveProblem': {
      const look = await lookRow(input.lookId)
      const { data, error } = await supabaseAdmin.rpc('resolve_look_problem', {
        p_admin: admin.id, p_look_id: look.id, p_refund: input.refund === true, p_reply: typeof input.reply === 'string' ? input.reply.slice(0, 500) : '',
      })
      if (error) throw dbError(error, 'Unable to answer the report')
      if ((data as { error?: string }).error) throw new ApiError(400, 'NOT_OPEN', 'This report has already been answered.')
      break
    }
    case 'complaint': {
      const id = typeof input.id === 'string' && UUID.test(input.id) ? input.id : null
      const status = input.status === 'ACKNOWLEDGED' || input.status === 'RESOLVED' ? input.status : null
      if (!id || !status) throw new ApiError(400, 'INVALID_INPUT', 'Unknown complaint or status.')
      const resolution = typeof input.resolution === 'string' ? input.resolution.trim().slice(0, 2000) : ''
      if (status === 'RESOLVED' && !resolution) throw new ApiError(400, 'INVALID_INPUT', 'Write what was done (kept with the complaint).')
      const now = new Date().toISOString()
      const update: Record<string, unknown> = { status, handled_by: admin.id }
      if (status === 'ACKNOWLEDGED') update.acknowledged_at = now
      if (status === 'RESOLVED') Object.assign(update, { resolved_at: now, resolution })
      const { data, error } = await supabaseAdmin.from('grievances').update(update).eq('id', id).select('ticket, acknowledged_at').single()
      if (error) throw dbError(error, 'Unable to update the complaint')
      if (status === 'RESOLVED' && !data.acknowledged_at) await supabaseAdmin.from('grievances').update({ acknowledged_at: now }).eq('id', id)
      await record(admin, 'COMPLAINT_UPDATED', null, null, `${data.ticket}: ${status}${resolution ? ` - ${resolution}` : ''}`.slice(0, 500))
      break
    }
    default:
      throw new ApiError(400, 'INVALID_INPUT', 'Unknown action.')
  }
  return safetyOverview()
}
