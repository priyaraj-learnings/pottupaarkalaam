import 'server-only'

import { GoogleAuth, OAuth2Client } from 'google-auth-library'

// =======================================================
// CLOUD TASKS (production and UAT)
//
// Firebase Hosting ends a request after 60 seconds, and a
// picture can take longer. So each look is a Cloud Task
// that calls the worker (/api/internal/make-look) on the
// Cloud Run address directly, with a Google-signed token
// for the runner service account. Cloud Run's CPU is paid
// only while a picture is being made. The same pattern as
// UduthiPaar's Try-On worker.
//
// Without TASKS_QUEUE / WORKER_URL (local development) the
// looks are made in the same server after the reply.
// =======================================================

type TasksConfig = {
  projectId: string
  location: string
  queue: string
  serviceAccount: string
  workerUrl: string
  audience: string
}

export const WORKER_PATH = '/api/internal/make-look'

export function cloudTasksConfig(): TasksConfig | null {
  if (process.env.JOB_DISPATCH !== 'CLOUD_TASKS') return null
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim()
  const location = process.env.TASKS_LOCATION?.trim()
  const queue = process.env.TASKS_QUEUE?.trim()
  const serviceAccount = process.env.TASK_SERVICE_ACCOUNT?.trim()
  const base = process.env.WORKER_URL?.trim()
  if (!projectId || !location || !queue || !serviceAccount || !base) {
    console.error(JSON.stringify({ event: 'cloud_tasks.not_configured', message: 'JOB_DISPATCH=CLOUD_TASKS needs GOOGLE_CLOUD_PROJECT, TASKS_LOCATION, TASKS_QUEUE, TASK_SERVICE_ACCOUNT and WORKER_URL.' }))
    return null
  }
  const origin = new URL(base)
  if (origin.protocol !== 'https:') throw new Error('WORKER_URL must be the https Cloud Run address.')
  return { projectId, location, queue, serviceAccount, workerUrl: `${origin.origin}${WORKER_PATH}`, audience: origin.origin }
}

export async function enqueueLook(config: TasksConfig, lookId: string) {
  const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
  const queuePath = `projects/${encodeURIComponent(config.projectId)}/locations/${encodeURIComponent(config.location)}/queues/${encodeURIComponent(config.queue)}`
  await client.request({
    url: `https://cloudtasks.googleapis.com/v2/${queuePath}/tasks`,
    method: 'POST',
    data: {
      task: {
        dispatchDeadline: '300s',
        httpRequest: {
          httpMethod: 'POST',
          url: config.workerUrl,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ lookId }), 'utf8').toString('base64'),
          oidcToken: { serviceAccountEmail: config.serviceAccount, audience: config.audience },
        },
      },
    },
  })
}

// The worker accepts only Cloud Tasks' token for the runner service account.
export async function isCloudTasksRequest(request: Request) {
  const config = cloudTasksConfig()
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!config || !token) return false
  try {
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience: config.audience })
    const payload = ticket.getPayload()
    return payload?.email === config.serviceAccount && payload.email_verified === true
  } catch {
    return false
  }
}
