import 'server-only'

// A failure the person can act on: its message is shown on screen.
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message)
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' }

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } })
}

// Runs a route and turns errors into JSON. Unexpected errors are logged and
// answered with a general message, never with database or provider details.
export async function handle(work: () => Promise<Response>) {
  try {
    return await work()
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: { code: error.code, message: error.message, ...error.extra } }, error.status)
    }
    console.error(JSON.stringify({
      event: 'api.unexpected_error',
      message: error instanceof Error ? error.message : String(error),
    }))
    return json({ error: { code: 'UNAVAILABLE', message: 'Something went wrong. Please try again.' } }, 500)
  }
}

// Supabase / PostgREST errors are plain objects, not Error instances.
export function dbError(error: { message?: string } | null, what: string) {
  return new Error(`${what}: ${error?.message ?? 'unknown database error'}`)
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Constant-time comparison for shared secrets (cron, payment alerts).
export function secretMatches(supplied: string | null | undefined, expected: string | undefined) {
  if (!supplied || !expected) return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

export function bearerToken(request: Request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null
}
