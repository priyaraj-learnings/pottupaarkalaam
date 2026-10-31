import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { ApiError, dbError } from '@/lib/server/http'

// =======================================================
// TELEGRAM ALERTS: a recharge needs checking
//
// The admin makes a bot with @BotFather and saves its token
// in /admin Settings. Whoever should get the alerts (a person,
// or a group the bot is in) sends the bot a message, and the
// admin presses Connect: the app takes that chat from the
// bot's latest messages. Telegram bots cannot message a phone
// number directly. The alert carries only the amount, the
// credits and the last 4 digits of the UTR: no customer name,
// email or number.
// =======================================================

const API = 'https://api.telegram.org'
// The token BotFather gives: "<digits>:<35 letters, digits, _ or ->".
export const TELEGRAM_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/

type Row = { telegram_bot_token: string | null; telegram_chat_id: string | null; telegram_chat_name: string | null; telegram_admin_url: string | null }

async function settings(): Promise<Row> {
  const { data, error } = await supabaseAdmin.from('app_settings')
    .select('telegram_bot_token, telegram_chat_id, telegram_chat_name, telegram_admin_url').eq('id', true).maybeSingle()
  if (error) throw dbError(error, 'Unable to load Telegram settings')
  return (data ?? { telegram_bot_token: null, telegram_chat_id: null, telegram_chat_name: null, telegram_admin_url: null }) as Row
}

// What /admin Settings shows (never the token).
export async function telegramStatus() {
  const row = await settings().catch(() => null)
  return {
    tokenSet: Boolean(row?.telegram_bot_token),
    chatName: row?.telegram_chat_id ? (row.telegram_chat_name ?? 'Connected chat') : null,
  }
}

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}/bot${token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ApiError(502, 'TELEGRAM_UNAVAILABLE', 'Could not reach Telegram. Please try again.')
  }
  const result = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null
  if (!response.ok || !result?.ok) {
    const said = typeof result?.description === 'string' ? result.description.slice(0, 160) : `HTTP ${response.status}`
    throw new ApiError(400, 'TELEGRAM_FAILED', `Telegram said: ${said}`)
  }
  return result.result as T
}

type Chat = { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string }
type Update = { message?: { chat: Chat }; my_chat_member?: { chat: Chat }; channel_post?: { chat: Chat } }

function chatName(chat: Chat) {
  const name = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ')
  return `${name || 'Telegram chat'}${chat.username ? ` (@${chat.username})` : ''}${chat.type === 'private' ? '' : ` · ${chat.type}`}`.slice(0, 200)
}

// The chat that messaged the bot most recently.
export function latestChat(updates: Update[]): Chat | null {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index]
    const chat = update.message?.chat ?? update.my_chat_member?.chat ?? update.channel_post?.chat
    if (chat) return chat
  }
  return null
}

export function rechargeAlertText(recharge: { amountInr: number; credits: number; utr: string }, adminUrl: string | null) {
  return [
    '💰 PottuPaarkalaam: a recharge needs checking',
    `₹${recharge.amountInr.toLocaleString('en-IN')} for ${recharge.credits} credits · UTR ending ${recharge.utr.slice(-4)}`,
    adminUrl ? `Approve or reject: ${adminUrl}` : 'Approve or reject it in /admin → Payments.',
  ].join('\n')
}

// /admin Settings buttons.
export async function telegramAction(body: unknown) {
  const input = (body ?? {}) as { action?: unknown; adminUrl?: unknown }
  const row = await settings()
  const token = row.telegram_bot_token
  if (input.action === 'disconnect') {
    const { error } = await supabaseAdmin.from('app_settings')
      .update({ telegram_chat_id: null, telegram_chat_name: null }).eq('id', true)
    if (error) throw dbError(error, 'Unable to save Telegram settings')
    return telegramStatus()
  }
  if (!token) throw new ApiError(400, 'NOT_CONFIGURED', 'Save the bot token first.')
  if (input.action === 'connect') {
    const chat = latestChat(await call<Update[]>(token, 'getUpdates'))
    if (!chat) {
      throw new ApiError(400, 'NO_MESSAGE', 'The bot has no message yet. In Telegram, open your bot, press Start (or send "hi"), then press Connect again. For a group, add the bot to the group and send a message there.')
    }
    const adminUrl = typeof input.adminUrl === 'string' && /^https:\/\/[^\s]{3,280}\/admin$/.test(input.adminUrl) ? input.adminUrl : row.telegram_admin_url
    const name = chatName(chat)
    await call(token, 'sendMessage', { chat_id: chat.id, text: `✅ Connected. Recharges that need checking will be sent here.\n${adminUrl ?? ''}`.trim() })
    const { error } = await supabaseAdmin.from('app_settings')
      .update({ telegram_chat_id: String(chat.id), telegram_chat_name: name, telegram_admin_url: adminUrl }).eq('id', true)
    if (error) throw dbError(error, 'Unable to save Telegram settings')
    return telegramStatus()
  }
  if (input.action === 'test') {
    if (!row.telegram_chat_id) throw new ApiError(400, 'NOT_CONNECTED', 'Press Connect first.')
    await call(token, 'sendMessage', { chat_id: row.telegram_chat_id, text: `🔔 Test alert\n${rechargeAlertText({ amountInr: 500, credits: 50, utr: '000000001234' }, row.telegram_admin_url)}` })
    return telegramStatus()
  }
  throw new ApiError(400, 'INVALID_INPUT', 'Unknown action.')
}

// After a customer submits a recharge that waits for an admin. Never throws:
// a recharge is saved whether or not the alert goes out.
export async function alertRechargeToCheck(recharge: { amountInr: number; credits: number; utr: string }) {
  try {
    const row = await settings()
    if (!row.telegram_bot_token || !row.telegram_chat_id) return false
    await call(row.telegram_bot_token, 'sendMessage', {
      chat_id: row.telegram_chat_id, text: rechargeAlertText(recharge, row.telegram_admin_url), disable_web_page_preview: true,
    })
    return true
  } catch (error) {
    console.error(JSON.stringify({ event: 'telegram.alert_failed', message: error instanceof Error ? error.message : String(error) }))
    return false
  }
}
