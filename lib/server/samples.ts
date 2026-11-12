import 'server-only'

import { randomUUID } from 'node:crypto'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { ApiError, dbError, UUID } from '@/lib/server/http'
import { photoForModel, validatePhoto } from '@/lib/server/images'

// =======================================================
// SAMPLE MODELS ("Try it on a model first")
//
// Photos of people the admin adds in /admin Settings, only
// with each person's written agreement. Customers who do not
// want to use their own photo yet can pick one as the person
// in the picture. They are public (bucket "sample-models").
// =======================================================

const BUCKET = 'sample-models'
const MAX_MODELS = 12

export type SampleModel = { id: string; url: string; label: string; gender: 'WOMAN' | 'MAN' }

type Row = { id: string; path: string; label: string; gender: 'WOMAN' | 'MAN' }

const publicUrl = (path: string) => supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

export async function listSampleModels(): Promise<SampleModel[]> {
  const { data, error } = await supabaseAdmin.from('sample_models').select('id, path, label, gender')
    .order('sort', { ascending: true }).order('created_at', { ascending: true }).limit(MAX_MODELS)
  if (error) throw dbError(error, 'Unable to load the sample models')
  return ((data ?? []) as Row[]).map(row => ({ id: row.id, url: publicUrl(row.path), label: row.label, gender: row.gender }))
}

// Form fields: photo, label ("Priya, full length"), gender (WOMAN | MAN) and
// agreed=true (the admin confirms the person agreed in writing).
export async function addSampleModel(adminId: string, form: FormData | null) {
  const photo = form?.get('photo')
  const label = String(form?.get('label') ?? '').trim()
  const gender = form?.get('gender') === 'MAN' ? 'MAN' : 'WOMAN'
  if (form?.get('agreed') !== 'true') {
    throw new ApiError(400, 'NOT_AGREED', 'Tick that the person in the photo agreed in writing to it being shown to customers.')
  }
  if (!(photo instanceof File)) throw new ApiError(400, 'INVALID_PHOTO', 'Choose a photo.')
  if (!label || label.length > 60) throw new ApiError(400, 'INVALID_INPUT', 'Give the model a short name (up to 60 letters).')
  const { count } = await supabaseAdmin.from('sample_models').select('id', { count: 'exact', head: true })
  if ((count ?? 0) >= MAX_MODELS) throw new ApiError(400, 'TOO_MANY', `Up to ${MAX_MODELS} sample models. Delete one first.`)
  const checked = await validatePhoto(photo, 'photo')
  const bytes = await photoForModel(checked.bytes, 1024, 1536)
  const path = `models/${randomUUID()}.jpg`
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw dbError(uploadError, 'Unable to upload the photo')
  const { error } = await supabaseAdmin.from('sample_models').insert({ path, label, gender, sort: count ?? 0, created_by: adminId })
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => undefined)
    throw dbError(error, 'Unable to save the sample model')
  }
  return listSampleModels()
}

export async function deleteSampleModel(id: string | null) {
  if (!id || !UUID.test(id)) throw new ApiError(400, 'INVALID_INPUT', 'Unknown sample model.')
  const { data, error } = await supabaseAdmin.from('sample_models').delete().eq('id', id).select('path').maybeSingle()
  if (error) throw dbError(error, 'Unable to delete the sample model')
  if (data?.path) await supabaseAdmin.storage.from(BUCKET).remove([data.path as string]).catch(() => undefined)
  return listSampleModels()
}
