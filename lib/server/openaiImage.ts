import 'server-only'

import OpenAI, { toFile } from 'openai'

// =======================================================
// CHATGPT IMAGE MODEL (OpenAI Images API, image edit)
//
// The same model and size as UduthiPaar's shop Try-Ons.
// Quality "low" keeps a picture at roughly Rs 2.5-4 with a
// customer photo and one or two garment photos (the
// research note in docs/SETUP.md has the numbers); "medium"
// costs more than the Rs 5 bulk price, so change it only
// together with the prices.
// =======================================================

type Quality = 'low' | 'medium' | 'high'

export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2.5-flare'

function quality(): Quality {
  const value = process.env.OPENAI_IMAGE_QUALITY?.trim()
  return value === 'medium' || value === 'high' ? value : 'low'
}

// USD per 1M tokens for the GPT Image 2 / 2.5 family. Used only for the cost
// estimate shown to admins; check https://openai.com/api/pricing and update
// when OpenAI changes it.
const RATES_USD_PER_MILLION = { inputText: 5, inputImage: 8, outputImage: 30 }
const USD_TO_INR = 88

export type ImageUsage = {
  inputTextTokens: number
  inputImageTokens: number
  outputTokens: number
}

export function estimateCostInr(usage: ImageUsage | null) {
  if (!usage) return null
  const usd = (usage.inputTextTokens * RATES_USD_PER_MILLION.inputText
    + usage.inputImageTokens * RATES_USD_PER_MILLION.inputImage
    + usage.outputTokens * RATES_USD_PER_MILLION.outputImage) / 1_000_000
  return Math.round(usd * USD_TO_INR * 10_000) / 10_000
}

type OpenAIUsage = {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { text_tokens?: number; image_tokens?: number }
}

function readUsage(usage: OpenAIUsage | null | undefined): ImageUsage | null {
  if (!usage) return null
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)
  const inputImage = count(usage.input_tokens_details?.image_tokens)
  const inputText = usage.input_tokens_details ? count(usage.input_tokens_details.text_tokens) : Math.max(0, count(usage.input_tokens) - inputImage)
  return { inputTextTokens: inputText, inputImageTokens: inputImage, outputTokens: count(usage.output_tokens) }
}

export type GeneratedImage = {
  base64: string
  mimeType: string
  model: string
  usage: ImageUsage | null
  latencyMs: number
}

// A message the customer can be shown. Provider details stay in the logs.
export class GenerationError extends Error {
  constructor(public publicMessage: string, detail: string) {
    super(detail)
  }
}

let client: OpenAI | null = null

function openai() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  client ??= new OpenAI({ apiKey, timeout: 180_000, maxRetries: 1 })
  return client
}

export async function generateTryOnImage(input: { images: Buffer[]; prompt: string }): Promise<GeneratedImage> {
  const startedAt = Date.now()
  const files = await Promise.all(input.images.map((bytes, index) =>
    toFile(bytes, index === 0 ? 'customer.jpg' : `garment-${index}.jpg`, { type: 'image/jpeg' })))
  try {
    const response = await openai().images.edit({
      model: IMAGE_MODEL,
      image: files,
      prompt: input.prompt,
      size: '1024x1536',
      quality: quality(),
      output_format: 'webp',
    })
    const output = response.data?.[0]?.b64_json
    if (!output) throw new GenerationError('The picture could not be made. Please try again.', 'OpenAI returned no image data.')
    return {
      base64: output,
      mimeType: 'image/webp',
      model: IMAGE_MODEL,
      usage: readUsage(response.usage as OpenAIUsage | undefined),
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    if (error instanceof GenerationError) throw error
    const shape = error as { code?: unknown; status?: unknown; message?: unknown }
    const detail = `OpenAI image edit failed (${String(shape.status ?? '')} ${String(shape.code ?? '')}): ${String(shape.message ?? error)}`
    if (shape.code === 'moderation_blocked' || /safety|moderation/i.test(String(shape.message ?? ''))) {
      throw new GenerationError('This photo could not be used. Please try a different photo of yourself or the clothes.', detail)
    }
    throw new GenerationError('The picture could not be made. Please try again.', detail)
  }
}
