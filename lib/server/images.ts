import 'server-only'

import sharp from 'sharp'

import { AI_LABEL_PNG_BASE64 } from '@/lib/server/aiLabel'
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

// =======================================================
// AI LABEL (IT Rules 2021, rule 3(3), as amended in 2026)
//
// Every picture is AI-made ("synthetically generated
// information"), so each one carries a visible label and,
// inside the file, metadata saying so with its unique ID.
// The label is in the stored pixels: no unlabelled copy
// is ever served, saved or shared.
// =======================================================

const AI_LABEL = Buffer.from(AI_LABEL_PNG_BASE64, 'base64')
// The IPTC term that photo apps and platforms read as "made by AI".
const IPTC_AI_SOURCE = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'

export function aiPictureId(lookId: string) {
  return `pp-${lookId}`
}

function aiMetadata(lookId: string) {
  const id = aiPictureId(lookId)
  const description = `AI-generated image made with PottuPaarkalaam (inaivu IT). Not a real photograph. ID: ${id}`
  const exif = {
    IFD0: {
      ImageDescription: description,
      Software: 'PottuPaarkalaam AI try-on',
      Artist: 'inaivu IT (PottuPaarkalaam)',
      ImageUniqueID: id,
    },
  }
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`
    + `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"`
    + ` Iptc4xmpExt:DigitalSourceType="${IPTC_AI_SOURCE}">`
    + `<dc:identifier>${id}</dc:identifier>`
    + `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${description}</rdf:li></rdf:Alt></dc:description>`
    + `</rdf:Description></rdf:RDF></x:xmpmeta>`
  return { exif, xmp }
}

// The picture with the label at the bottom left, about 42% of its width.
async function withAiLabel(original: Buffer) {
  const { width, height } = await sharp(original, { limitInputPixels: 40_000_000 }).metadata()
  if (!width || !height) throw new Error('picture has no size')
  const labelWidth = Math.round(width * 0.42)
  const label = await sharp(AI_LABEL).resize({ width: labelWidth }).toBuffer()
  const { height: labelHeight = 0 } = await sharp(label).metadata()
  const margin = Math.round(width * 0.025)
  return sharp(original, { limitInputPixels: 40_000_000 })
    .composite([{ input: label, left: margin, top: Math.max(0, height - labelHeight - margin) }])
}

// Try-on pictures are stored labelled, as WEBP (much smaller than PNG), or as
// PNG if WEBP fails. If labelling itself fails the picture fails (and its
// credits come back): an unlabelled AI picture is never kept.
export async function encodeForStorage(base64: string, lookId: string) {
  const original = Buffer.from(base64, 'base64')
  const { exif, xmp } = aiMetadata(lookId)
  try {
    const bytes = await (await withAiLabel(original)).webp({ quality: 90, effort: 4 }).withExif(exif).withXmp(xmp).toBuffer()
    if (!bytes.length) throw new Error('empty WEBP')
    return { bytes, contentType: 'image/webp', extension: 'webp' }
  } catch (error) {
    console.error('Unable to store the try-on picture as WEBP; storing PNG', error instanceof Error ? error.message : error)
    const bytes = await (await withAiLabel(original)).png().withExif(exif).withXmp(xmp).toBuffer()
    return { bytes, contentType: 'image/png', extension: 'png' }
  }
}

// Saved and shared pictures are JPEG: WhatsApp sends a .webp as a sticker and
// some gallery apps cannot open it.
// They keep the AI metadata (the label is already in the pixels).
export async function toJpeg(input: Blob, lookId: string) {
  const { exif, xmp } = aiMetadata(lookId)
  return sharp(Buffer.from(await input.arrayBuffer()), { limitInputPixels: 40_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .withExif(exif)
    .withXmp(xmp)
    .toBuffer()
}
