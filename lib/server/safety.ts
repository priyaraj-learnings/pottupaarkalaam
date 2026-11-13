import 'server-only'

import { after } from 'next/server'

import { logEvent } from '@/lib/server/audit'
import type { SignedInUser } from '@/lib/server/auth'
import { ApiError, dbError, UUID } from '@/lib/server/http'
import { alertAdmins } from '@/lib/server/telegram'
import { supabaseAdmin } from '@/lib/supabase/admin'

// =======================================================
// SAFETY: problem reports, complaints, blocking and take-downs
// (Consumer Protection Act 2019; IT Rules 2021, rules 3(1)(c),
// 3(1)(g), 3(2); DPDP Act 2023, section 13).
// =======================================================

export const PROBLEM_REASONS = ['FACE_CHANGED', 'WRONG_GARMENT', 'DISTORTED', 'OTHER'] as const

const PROBLEM_ERRORS: Record<string, string> = {
  NOT_FOUND: 'This picture is no longer available.',
  NOT_FINISHED: 'Only a finished picture can be reported.',
  ALREADY_REFUNDED: 'The credits for this picture are already back.',
  ALREADY_REPORTED: 'You have already reported this picture. We will reply soon.',
  TOO_LATE: 'Pictures can be reported within 3 days of being made.',
  INVALID_REASON: 'Choose what is wrong with the picture.',
  TOO_MANY: 'You have reported many pictures this month. Please write to us from the Complaints page.',
}

// {"reason": "FACE_CHANGED" | "WRONG_GARMENT" | "DISTORTED" | "OTHER", "note"}
export async function reportProblem(user: SignedInUser, lookId: string, body: unknown, request: Request) {
  if (!UUID.test(lookId)) throw new ApiError(404, 'NOT_FOUND', PROBLEM_ERRORS.NOT_FOUND)
  const input = (body ?? {}) as { reason?: unknown; note?: unknown }
  const reason = typeof input.reason === 'string' ? input.reason : ''
  const note = typeof input.note === 'string' ? input.note.slice(0, 500) : ''
  const { data, error } = await supabaseAdmin.rpc('report_look_problem', { p_user_id: user.id, p_look_id: lookId, p_reason: reason, p_note: note })
  if (error) throw dbError(error, 'Unable to send the report')
  const result = data as { error?: string; reported?: boolean }
  if (result.error) throw new ApiError(result.error === 'NOT_FOUND' ? 404 : 400, result.error, PROBLEM_ERRORS[result.error] ?? 'The report could not be sent.')
  void logEvent(user.id, 'PROBLEM_REPORTED', lookId, request)
  after(() => alertAdmins('⚠️ PottuPaarkalaam: a customer reported a problem with a picture. Check it in /admin → Safety.'))
  return { reported: true }
}

// ---------------------------------------------------------------------------
// Complaints (/complaints): anyone, signed in or not.
// ---------------------------------------------------------------------------

export const COMPLAINT_CATEGORIES = ['MY_PHOTO_WITHOUT_CONSENT', 'INTIMATE_OR_SEXUAL', 'IMPERSONATION', 'CHILD', 'PRIVACY_REQUEST', 'PAYMENT', 'PICTURE_QUALITY', 'OTHER'] as const
// Acted on within 2 hours (IT Rules 2021, rule 3(2)(b), as amended).
const URGENT = new Set(['INTIMATE_OR_SEXUAL', 'IMPERSONATION', 'CHILD', 'MY_PHOTO_WITHOUT_CONSENT'])

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

export async function sendComplaint(user: SignedInUser | null, body: unknown, request: Request) {
  const input = (body ?? {}) as Record<string, unknown>
  const name = text(input.name, 100)
  const contact = text(input.contact, 200)
  const category = text(input.category, 40)
  const pictureId = text(input.pictureId, 60).replace(/[^A-Za-z0-9-]/g, '') || null
  const details = text(input.details, 3000)
  if (!name) throw new ApiError(400, 'INVALID_INPUT', 'Enter your name.')
  if (contact.length < 3) throw new ApiError(400, 'INVALID_INPUT', 'Enter an email address or mobile number we can reply to.')
  if (!(COMPLAINT_CATEGORIES as readonly string[]).includes(category)) throw new ApiError(400, 'INVALID_INPUT', 'Choose what the complaint is about.')
  if (details.length < 5) throw new ApiError(400, 'INVALID_INPUT', 'Tell us what happened.')
  const urgent = URGENT.has(category)
  const { data, error } = await supabaseAdmin.from('grievances').insert({
    user_id: user?.id ?? null, name, contact, category, picture_id: pictureId, details, urgent,
  }).select('ticket').single()
  if (error) throw dbError(error, 'Unable to send the complaint')
  if (user) void logEvent(user.id, 'COMPLAINT_SENT', null, request)
  after(() => alertAdmins(`${urgent ? '🚨 URGENT (act within 2 hours)' : '📮'} PottuPaarkalaam: new complaint ${data.ticket} (${category.toLowerCase().replace(/_/g, ' ')}). Open /admin → Safety.`))
  return { ticket: data.ticket as string, urgent }
}
