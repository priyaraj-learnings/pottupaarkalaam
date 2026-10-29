import 'server-only'

import { randomUUID } from 'node:crypto'

import { after } from 'next/server'

import { buildCouplePrompt, buildPairPrompt, buildSinglePrompt } from '@/lib/prompts'
import {
  coupleGarmentAllowed,
  MAX_GARMENTS,
  PHOTO_BUCKET,
  planLooks,
  RETENTION_DAYS,
  SOURCE_LABELS,
  TERMS_VERSION,
  type CoupleRole,
  type GarmentSource,
  type LookGarment,
  type LookKind,
  type PairRole,
} from '@/lib/rules'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAccount, loadSettings } from '@/lib/server/account'
import type { SignedInUser } from '@/lib/server/auth'
import { cloudTasksConfig, enqueueLook } from '@/lib/server/cloudTasks'
import { ApiError, dbError, UUID } from '@/lib/server/http'
import { encodeForStorage, photoForModel, toJpeg, validatePhoto } from '@/lib/server/images'
import { estimateCostInr, generateTryOnImage, GenerationError } from '@/lib/server/openaiImage'

// =======================================================
// LOOKS (try-on pictures)
//
// One "Try on" press uploads the customer's photo and up
// to 5 garment photos, takes the credits and queues one
// look per garment or pair (SQL create_looks). The pictures
// are made in the background (Firebase Hosting ends
// requests after 60 s; a picture can take longer): by the
// Cloud Tasks worker in UAT and production, or after the
// reply locally. The app polls for them. Any failure gives
// the credits back (SQL fail_look). Photos are kept for
// 3 days.
// =======================================================

const STALE_AFTER_MS = 10 * 60 * 1000
const SIGNED_URL_SECONDS = 60 * 60
const LOOK_COLUMNS = 'id, batch_id, kind, garments, credits, status, image_path, error_message, refunded_at, created_at'

type LookRow = {
  id: string
  batch_id: string
  kind: LookKind
  garments: LookGarment[]
  credits: number
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  image_path: string | null
  error_message: string | null
  refunded_at: string | null
  created_at: string
}

export type LookView = {
  id: string
  kind: LookKind
  credits: number
  status: LookRow['status']
  garments: Array<{ category: string; source: GarmentSource; role: LookGarment['role'] }>
  imageUrl: string | null
  error: string | null
  refunded: boolean
  createdAt: string
  expiresAt: string
}

const storage = () => supabaseAdmin.storage.from(PHOTO_BUCKET)

async function upload(path: string, bytes: Buffer, contentType: string) {
  const { error } = await storage().upload(path, bytes, { contentType, upsert: true, cacheControl: '0' })
  if (error) throw dbError(error, 'Unable to save the photo')
}

async function download(path: string) {
  const { data, error } = await storage().download(path)
  if (error || !data) throw dbError(error, 'Unable to read the photo')
  return data
}

async function removeFiles(paths: string[]) {
  if (!paths.length) return
  const { error } = await storage().remove(paths)
  if (error) throw dbError(error, 'Unable to delete photos')
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function parseJson<T>(value: FormDataEntryValue | null, what: string): T {
  try {
    return JSON.parse(String(value ?? '')) as T
  } catch {
    throw new ApiError(400, 'INVALID_INPUT', `Invalid ${what}.`)
  }
}

export async function createTryOns(user: SignedInUser, form: FormData) {
  const photo = form.get('photo')
  if (!(photo instanceof File)) throw new ApiError(400, 'PHOTO_REQUIRED', 'Add your photo first.')
  const files = form.getAll('garment').filter((item): item is File => item instanceof File)
  const garments = parseJson<Array<{ category: string; source: GarmentSource }>>(form.get('garments'), 'clothes list')
  const pairs = parseJson<Array<[number, number]>>(form.get('pairs') ?? '[]', 'pairs')
  if (!Array.isArray(garments) || !Array.isArray(pairs) || !pairs.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isInteger))) {
    throw new ApiError(400, 'INVALID_INPUT', 'Invalid clothes list.')
  }
  if (files.length !== garments.length || files.length > MAX_GARMENTS) {
    throw new ApiError(400, 'INVALID_INPUT', `Add up to ${MAX_GARMENTS} clothes photos.`)
  }
  const plan = planLooks(garments, pairs)
  if (!plan.ok) throw new ApiError(400, 'INVALID_INPUT', plan.message)

  // Checked again (atomically) when the credits are taken; this only spares
  // reading and storing photos that cannot be used.
  const account = await getAccount(user)
  if (account.termsVersion !== TERMS_VERSION) throw new ApiError(403, 'TERMS_REQUIRED', 'Please read and agree to the terms first.')
  if (account.freeLeft + account.credits < plan.credits) {
    throw new ApiError(402, 'INSUFFICIENT_CREDITS',
      `This needs ${plan.credits} credit${plan.credits === 1 ? '' : 's'}; you have ${account.freeLeft + account.credits}. Please recharge.`,
      { needed: plan.credits, available: account.freeLeft + account.credits })
  }

  const customer = await validatePhoto(photo, 'photo of you')
  const garmentPhotos = []
  for (const [index, file] of files.entries()) garmentPhotos.push(await validatePhoto(file, `clothes photo ${index + 1}`))

  await recoverStaleLooks(user.id)

  const batchId = randomUUID()
  const folder = `${user.id}/${batchId}`
  const photoPath = `${folder}/photo.${customer.extension}`
  const garmentPaths = garmentPhotos.map((garment, index) => `${folder}/garment-${index}.${garment.extension}`)
  const uploaded: string[] = []
  try {
    await upload(photoPath, customer.bytes, customer.contentType)
    uploaded.push(photoPath)
    for (const [index, garment] of garmentPhotos.entries()) {
      await upload(garmentPaths[index], garment.bytes, garment.contentType)
      uploaded.push(garmentPaths[index])
    }

    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString()
    const { data, error } = await supabaseAdmin.rpc('create_looks', {
      p_user_id: user.id,
      p_batch_id: batchId,
      p_photo_path: photoPath,
      p_garment_paths: garmentPaths,
      p_expires_at: expiresAt,
      p_terms_version: TERMS_VERSION,
      p_looks: plan.looks,
    })
    if (error) throw dbError(error, 'Unable to start the try-on')
    const result = data as { error?: string; needed?: number; available?: number; looks?: Array<{ id: string; kind: 'SINGLE' | 'PAIR'; credits: number }>; account?: unknown }
    if (result.error === 'TERMS_REQUIRED') throw new ApiError(403, 'TERMS_REQUIRED', 'Please read and agree to the terms first.')
    if (result.error === 'INSUFFICIENT_CREDITS') {
      throw new ApiError(402, 'INSUFFICIENT_CREDITS',
        `This needs ${result.needed} credit${result.needed === 1 ? '' : 's'}; you have ${result.available}. Please recharge.`,
        { needed: result.needed, available: result.available })
    }
    if (!result.looks?.length) throw new Error('No looks were created.')

    await dispatchLooks(result.looks.map(look => look.id))
    return { looks: result.looks.map(look => ({ ...look, status: 'QUEUED' as const })), account: result.account }
  } catch (error) {
    // Nothing was charged (or the charge failed): do not keep the photos.
    await removeFiles(uploaded).catch(cleanupError => console.error('Unable to remove photos of a refused try-on', cleanupError))
    throw error
  }
}

// Multipart form: hisPhoto, hisGarment, herPhoto, herGarment (files), garments
// (JSON {"his": {category, source}, "her": {category, source}}) and consent
// ("true": both people agreed to their photos being used).
export async function createCouple(user: SignedInUser, form: FormData) {
  const files = {
    hisPhoto: form.get('hisPhoto'), hisGarment: form.get('hisGarment'),
    herPhoto: form.get('herPhoto'), herGarment: form.get('herGarment'),
  }
  if (!Object.values(files).every(file => file instanceof File)) {
    throw new ApiError(400, 'PHOTO_REQUIRED', 'Add both garments and both photos first.')
  }
  const garments = parseJson<Record<'his' | 'her', { category: string; source: GarmentSource }>>(form.get('garments'), 'clothes list')
  const garmentFor = (key: 'his' | 'her', role: CoupleRole): LookGarment => {
    const garment = garments?.[key]
    if (!garment || !coupleGarmentAllowed(role, garment.category) || !(garment.source in SOURCE_LABELS)) {
      throw new ApiError(400, 'INVALID_INPUT', role === 'HIS' ? 'Choose a men\'s garment for him.' : 'Choose a women\'s garment for her.')
    }
    return { index: role === 'HIS' ? 0 : 1, category: garment.category, source: garment.source, role }
  }
  const lookGarments = [garmentFor('his', 'HIS'), garmentFor('her', 'HER')]
  if (form.get('consent') !== 'true') {
    throw new ApiError(400, 'CONSENT_REQUIRED', 'Please confirm that both people agreed to their photos being used.')
  }

  // Checked again (atomically) when the credits are taken; this only spares
  // reading and storing photos that cannot be used.
  const [account, settings] = await Promise.all([getAccount(user), loadSettings()])
  if (account.termsVersion !== TERMS_VERSION) throw new ApiError(403, 'TERMS_REQUIRED', 'Please read and agree to the terms first.')
  if (!settings.couple.enabled || !account.coupleOptIn) throw new ApiError(403, 'COUPLE_OFF', 'Couple pictures are not turned on.')
  if (account.credits < settings.couple.credits) throw coupleCreditsError(settings.couple.credits, account.credits)

  const his = await validatePhoto(files.hisPhoto as File, 'photo of him')
  const her = await validatePhoto(files.herPhoto as File, 'photo of her')
  const hisGarment = await validatePhoto(files.hisGarment as File, 'his clothes photo')
  const herGarment = await validatePhoto(files.herGarment as File, 'her clothes photo')

  await recoverStaleLooks(user.id)

  const batchId = randomUUID()
  const folder = `${user.id}/${batchId}`
  const paths = {
    his: `${folder}/photo.${his.extension}`,
    her: `${folder}/partner.${her.extension}`,
    hisGarment: `${folder}/garment-0.${hisGarment.extension}`,
    herGarment: `${folder}/garment-1.${herGarment.extension}`,
  }
  const uploaded: string[] = []
  try {
    for (const [path, photo] of [[paths.his, his], [paths.her, her], [paths.hisGarment, hisGarment], [paths.herGarment, herGarment]] as const) {
      await upload(path, photo.bytes, photo.contentType)
      uploaded.push(path)
    }
    const { data, error } = await supabaseAdmin.rpc('create_couple_look', {
      p_user_id: user.id,
      p_batch_id: batchId,
      p_photo_path: paths.his,
      p_partner_photo_path: paths.her,
      p_garment_paths: [paths.hisGarment, paths.herGarment],
      p_expires_at: new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString(),
      p_terms_version: TERMS_VERSION,
      p_garments: lookGarments,
    })
    if (error) throw dbError(error, 'Unable to start the couple picture')
    const result = data as { error?: string; needed?: number; available?: number; look?: { id: string; kind: 'COUPLE'; credits: number }; account?: unknown }
    if (result.error === 'TERMS_REQUIRED') throw new ApiError(403, 'TERMS_REQUIRED', 'Please read and agree to the terms first.')
    if (result.error === 'COUPLE_OFF') throw new ApiError(403, 'COUPLE_OFF', 'Couple pictures are not turned on.')
    if (result.error === 'INSUFFICIENT_CREDITS') throw coupleCreditsError(result.needed ?? settings.couple.credits, result.available ?? 0)
    if (!result.look) throw new Error('No couple picture was created.')

    await dispatchLooks([result.look.id])
    return { looks: [{ ...result.look, status: 'QUEUED' as const }], account: result.account }
  } catch (error) {
    // Nothing was charged (or the charge failed): do not keep the photos.
    await removeFiles(uploaded).catch(cleanupError => console.error('Unable to remove photos of a refused couple picture', cleanupError))
    throw error
  }
}

function coupleCreditsError(needed: number, available: number) {
  return new ApiError(402, 'INSUFFICIENT_CREDITS',
    `A couple picture needs ${needed} paid credits; you have ${available}. Free credits can't be used for couple pictures. Please recharge.`,
    { needed, available })
}

// ---------------------------------------------------------------------------
// Make (in the background)
// ---------------------------------------------------------------------------

async function dispatchLooks(ids: string[]) {
  const tasks = cloudTasksConfig()
  if (!tasks) {
    after(() => Promise.all(ids.map(makeLookOnce)))
    return
  }
  for (const id of ids) {
    try {
      await enqueueLook(tasks, id)
    } catch (error) {
      console.error(JSON.stringify({ event: 'look.dispatch_failed', lookId: id, message: error instanceof Error ? error.message : String(error) }))
      await failLook(id, 'The picture could not be started. Your credits are back.')
    }
  }
}

// One delivery makes the look; a repeated delivery finds it claimed and stops.
export async function makeLookOnce(id: string) {
  try {
    if (await claimLook(id)) await makeLook(id)
  } catch (error) {
    console.error(JSON.stringify({ event: 'look.unexpected_error', lookId: id, message: error instanceof Error ? error.message : String(error) }))
    await failLook(id, 'The picture could not be made. Your credits are back.')
  }
}

// Only one run can take a queued look, so it is never made (or charged) twice.
async function claimLook(id: string) {
  const { data, error } = await supabaseAdmin.from('looks')
    .update({ status: 'PROCESSING', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'QUEUED').select('id').maybeSingle()
  if (error) throw dbError(error, 'Unable to claim the look')
  return Boolean(data)
}

async function failLook(id: string, message: string) {
  const { error } = await supabaseAdmin.rpc('fail_look', { p_look_id: id, p_message: message })
  if (error) console.error(JSON.stringify({ event: 'look.refund_failed', lookId: id, message: error.message }))
}

async function makeLook(id: string) {
  const { data: look, error } = await supabaseAdmin.from('looks')
    .select('id, user_id, batch_id, kind, garments, status').eq('id', id).single()
  if (error || !look) throw dbError(error, 'Unable to load the look')
  const { data: batch, error: batchError } = await supabaseAdmin.from('try_on_batches')
    .select('photo_path, partner_photo_path, garment_paths, purged_at').eq('id', look.batch_id).single()
  if (batchError || !batch) throw dbError(batchError, 'Unable to load the photos')
  if (batch.purged_at || !batch.photo_path || (look.kind === 'COUPLE' && !batch.partner_photo_path)) {
    await failLook(id, 'The photos were deleted before the picture was made. Your credits are back.')
    return
  }

  const garments = look.garments as LookGarment[]
  const garmentPaths = batch.garment_paths as string[]
  try {
    const person = (path: string) => download(path).then(blob => photoForModel(blob, 1024, 1536))
    const garmentImage = (garment: LookGarment) => download(garmentPaths[garment.index]).then(blob => photoForModel(blob, 1024, 1024))
    let images: Buffer[]
    let prompt: string
    if (look.kind === 'COUPLE') {
      // IMAGE 1 him, 2 his garment, 3 her, 4 her garment.
      images = await Promise.all([person(batch.photo_path), garmentImage(garments[0]), person(batch.partner_photo_path as string), garmentImage(garments[1])])
      prompt = buildCouplePrompt(garments[0], garments[1])
    } else {
      images = await Promise.all([person(batch.photo_path), ...garments.map(garmentImage)])
      prompt = look.kind === 'PAIR'
        ? buildPairPrompt(garments[0], garments[1], garments[1].role as PairRole)
        : buildSinglePrompt(garments[0])
    }

    const result = await generateTryOnImage({ images, prompt })
    const output = await encodeForStorage(result.base64, result.mimeType)
    const imagePath = `${look.user_id}/${look.batch_id}/look-${id}.${output.extension}`
    await upload(imagePath, output.bytes, output.contentType)

    const { data: done, error: doneError } = await supabaseAdmin.from('looks').update({
      status: 'COMPLETED',
      image_path: imagePath,
      ai_provider: 'OPENAI',
      ai_model: result.model,
      ai_usage: result.usage,
      estimated_cost_inr: estimateCostInr(result.usage),
      latency_ms: result.latencyMs,
      error_message: null,
      completed_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'PROCESSING').select('id').maybeSingle()
    if (doneError || !done) {
      // Given up on meanwhile (and refunded): do not keep an unpaid picture.
      await removeFiles([imagePath]).catch(() => undefined)
      if (doneError) throw dbError(doneError, 'Unable to save the look')
    }
  } catch (error) {
    const publicMessage = error instanceof GenerationError ? error.publicMessage : 'The picture could not be made. Please try again.'
    console.error(JSON.stringify({ event: 'look.failed', lookId: id, message: error instanceof Error ? error.message : String(error) }))
    await failLook(id, `${publicMessage} Your credits are back.`)
  }
}

// Looks that never finished (the server restarted mid-way) are given up on and
// refunded, so nobody pays for a picture they did not get.
export async function recoverStaleLooks(userId?: string) {
  let query = supabaseAdmin.from('looks').select('id')
    .in('status', ['QUEUED', 'PROCESSING'])
    .lt('created_at', new Date(Date.now() - STALE_AFTER_MS).toISOString())
    .limit(50)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw dbError(error, 'Unable to check unfinished pictures')
  for (const row of data ?? []) await failLook(row.id, 'The picture took too long. Your credits are back.')
  return (data ?? []).length
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function toViews(rows: LookRow[]): Promise<LookView[]> {
  const batchIds = [...new Set(rows.map(row => row.batch_id))]
  const { data: batches, error } = batchIds.length
    ? await supabaseAdmin.from('try_on_batches').select('id, expires_at').in('id', batchIds)
    : { data: [] as Array<{ id: string; expires_at: string }>, error: null }
  if (error) throw dbError(error, 'Unable to load the pictures')
  const expiry = new Map((batches ?? []).map(batch => [batch.id, batch.expires_at as string]))

  const paths = rows.filter(row => row.status === 'COMPLETED' && row.image_path).map(row => row.image_path as string)
  const { data: signed } = paths.length
    ? await storage().createSignedUrls(paths, SIGNED_URL_SECONDS)
    : { data: [] as Array<{ path: string | null; signedUrl: string }> }
  const urlFor = new Map((signed ?? []).map(item => [item.path, item.signedUrl]))

  return rows.map(row => ({
    id: row.id,
    kind: row.kind,
    credits: row.credits,
    status: row.status,
    garments: row.garments.map(({ category, source, role }) => ({ category, source, role })),
    imageUrl: row.status === 'COMPLETED' && row.image_path ? urlFor.get(row.image_path) ?? null : null,
    error: row.status === 'FAILED' ? row.error_message ?? 'The picture could not be made.' : null,
    refunded: Boolean(row.refunded_at),
    createdAt: row.created_at,
    expiresAt: expiry.get(row.batch_id) ?? row.created_at,
  }))
}

export async function looksById(userId: string, ids: string[]) {
  const wanted = ids.filter(id => UUID.test(id)).slice(0, 10)
  if (!wanted.length) return []
  await recoverStaleLooks(userId)
  const { data, error } = await supabaseAdmin.from('looks').select(LOOK_COLUMNS)
    .eq('user_id', userId).in('id', wanted).order('created_at', { ascending: true })
  if (error) throw dbError(error, 'Unable to load the pictures')
  return toViews((data ?? []) as LookRow[])
}

// The last 3 days, newest first. Pictures whose photos were deleted are left out.
export async function history(userId: string) {
  await recoverStaleLooks(userId)
  const since = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabaseAdmin.from('looks').select(`${LOOK_COLUMNS}, try_on_batches!inner(purged_at)`)
    .eq('user_id', userId).gte('created_at', since).is('try_on_batches.purged_at', null)
    .order('created_at', { ascending: false }).limit(60)
  if (error) throw dbError(error, 'Unable to load your pictures')
  return toViews((data ?? []) as unknown as LookRow[])
}

export async function lookAsJpeg(userId: string, id: string) {
  if (!UUID.test(id)) throw new ApiError(404, 'NOT_FOUND', 'Picture not found.')
  const { data, error } = await supabaseAdmin.from('looks').select('status, image_path')
    .eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw dbError(error, 'Unable to load the picture')
  const path = data?.status === 'COMPLETED' ? data.image_path as string | null : null
  if (!path || !path.startsWith(`${userId}/`)) throw new ApiError(404, 'NOT_FOUND', 'This picture has been deleted.')
  return toJpeg(await download(path))
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

// Removes a batch's photos and pictures; the rows stay (without pictures) for
// the credit history.
export async function purgeBatch(batch: { id: string; photo_path: string | null; partner_photo_path?: string | null; garment_paths: string[] | null }) {
  const { data: looks, error } = await supabaseAdmin.from('looks').select('image_path')
    .eq('batch_id', batch.id).not('image_path', 'is', null)
  if (error) throw dbError(error, 'Unable to list pictures')
  const paths = [batch.photo_path, batch.partner_photo_path ?? null, ...(batch.garment_paths ?? []), ...(looks ?? []).map(look => look.image_path as string)]
    .filter((path): path is string => Boolean(path))
  await removeFiles(paths)
  const { error: lookError } = await supabaseAdmin.from('looks').update({ image_path: null }).eq('batch_id', batch.id)
  if (lookError) throw dbError(lookError, 'Unable to clear pictures')
  const { error: batchError } = await supabaseAdmin.from('try_on_batches')
    .update({ photo_path: null, partner_photo_path: null, garment_paths: [], purged_at: new Date().toISOString() }).eq('id', batch.id)
  if (batchError) throw dbError(batchError, 'Unable to mark photos deleted')
  return paths.length
}

// "Delete my photos now".
export async function purgeAllForUser(userId: string) {
  const { data, error } = await supabaseAdmin.from('try_on_batches')
    .select('id, photo_path, partner_photo_path, garment_paths').eq('user_id', userId).is('purged_at', null)
  if (error) throw dbError(error, 'Unable to list your photos')
  let removed = 0
  for (const batch of data ?? []) removed += await purgeBatch(batch)
  return removed
}

// Hourly job: photos older than 3 days, and pictures that never finished.
export async function purgeExpired(now = new Date()) {
  const recovered = await recoverStaleLooks()
  const { data, error } = await supabaseAdmin.from('try_on_batches')
    .select('id, photo_path, partner_photo_path, garment_paths').is('purged_at', null).lte('expires_at', now.toISOString())
    .order('expires_at', { ascending: true }).limit(200)
  if (error) throw dbError(error, 'Unable to list expired photos')
  let batches = 0
  let failed = 0
  for (const batch of data ?? []) {
    try {
      await purgeBatch(batch)
      batches += 1
    } catch (purgeError) {
      failed += 1
      console.error(JSON.stringify({ event: 'cleanup.batch_failed', batchId: batch.id, message: purgeError instanceof Error ? purgeError.message : String(purgeError) }))
    }
  }
  return { recovered, batches, failed }
}
