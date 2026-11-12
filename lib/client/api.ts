'use client'

import { tr } from '@/lib/client/language'
import { supabase } from '@/lib/supabase/browser'

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message)
  }
}

async function accessToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ApiFailure(401, 'SIGN_IN_REQUIRED', tr('Please sign in again.', 'தயவுசெய்து மீண்டும் உள்நுழையுங்கள்.'))
  return token
}

// Calls this app's API with the signed-in person's token. `json` is sent as
// JSON; `body` (e.g. FormData) as it is.
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const headers = new Headers(rest.headers)
  headers.set('Authorization', `Bearer ${await accessToken()}`)
  if (json !== undefined) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(path, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body, cache: 'no-store' })
  } catch {
    throw new ApiFailure(0, 'OFFLINE', tr('No internet connection. Please try again.', 'இணைய இணைப்பு இல்லை. மீண்டும் முயற்சி செய்யுங்கள்.'))
  }
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    // An HTML error page (e.g. a timeout): use the general message below.
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } & Record<string, unknown> } | null)?.error
    throw new ApiFailure(response.status, error?.code ?? 'UNAVAILABLE', error?.message ?? tr('Something went wrong. Please try again.', 'ஏதோ தவறு நடந்துவிட்டது. மீண்டும் முயற்சி செய்யுங்கள்.'), error ?? {})
  }
  return payload as T
}

export async function apiBlob(path: string) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${await accessToken()}` }, cache: 'no-store' })
  if (!response.ok) throw new ApiFailure(response.status, 'NOT_FOUND', tr('This picture is no longer available.', 'இந்தப் படம் இப்போது கிடைக்கவில்லை.'))
  return response.blob()
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : tr('Something went wrong. Please try again.', 'ஏதோ தவறு நடந்துவிட்டது. மீண்டும் முயற்சி செய்யுங்கள்.')
}
