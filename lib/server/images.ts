import 'server-only'

import sharp from 'sharp'

import { ApiError } from '@/lib/server/http'

// Photo checks and conversions, from UduthiPaar (lib/security/validateImage,
// lib/platform/storage/jpegDownload and aiImageEncoding).

const FORMATS = { jpeg: ['image/jpeg', 'jpg'], png: ['image/png', 'png'], webp: ['image/webp', 'webp'] } as const
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Only JPEG, PNG and WEBP bytes reach the image decoder.
function hasImageSignature(bytes: Buffer) {
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const webp = bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  return jpeg || png || webp
}

// Decodes the whole image: metadata alone does not reject truncated content.
export async function validatePhoto(file: File, what: string) {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, 'INVALID_PHOTO', `The ${what} must be a photo of 10 MB or less.`)
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  if (!hasImageSignature(bytes)) throw new ApiError(400, 'INVALID_PHOTO', `The ${what} must be a JPG, PNG or WEBP photo.`)
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 40_000_000 })
    const metadata = await image.metadata()
    const format = FORMATS[metadata.format as keyof typeof FORMATS]
    if (!format || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) {
      throw new Error('unsupported image')
    }
    await image.stats()
    return { bytes, contentType: format[0], extension: format[1] }
  } catch {
    throw new ApiError(400, 'INVALID_PHOTO', `The ${what} could not be read. Please take it again.`)
  }
}

// Photos sent to the image model: upright, JPEG, and no bigger than needed
// (the model bills input images by size). The customer photo keeps more
// detail for the face.
export async function photoForModel(input: Buffer | Blob, maxWidth: number, maxHeight: number) {
  const bytes = input instanceof Blob ? Buffer.from(await input.arrayBuffer()) : input
  return sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer()
}

// Try-on pictures are stored as WEBP (much smaller than PNG). A paid picture
// must never be lost to encoding, so the original is kept if conversion fails.
export async function encodeForStorage(base64: string, mimeType: string) {
  const original = Buffer.from(base64, 'base64')
  if (mimeType === 'image/webp') return { bytes: original, contentType: 'image/webp', extension: 'webp' }
  try {
    const bytes = await sharp(original, { limitInputPixels: 40_000_000 }).webp({ quality: 90, effort: 4 }).toBuffer()
    if (!bytes.length) throw new Error('empty WEBP')
    return { bytes, contentType: 'image/webp', extension: 'webp' }
  } catch (error) {
    console.error('Unable to convert try-on picture to WEBP; storing PNG', error instanceof Error ? error.message : error)
    return { bytes: original, contentType: 'image/png', extension: 'png' }
  }
}

// Saved and shared pictures are JPEG: WhatsApp sends a .webp as a sticker and
// some gallery apps cannot open it.
export async function toJpeg(input: Blob) {
  return sharp(Buffer.from(await input.arrayBuffer()), { limitInputPixels: 40_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer()
}
