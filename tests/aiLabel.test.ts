import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { encodeForStorage, toJpeg } from '@/lib/server/images'

const LOOK_ID = '0b5c2f9e-1111-4222-8333-944455556666'

// A plain light-grey "picture" like the model's 1024 x 1536 output.
async function modelPicture() {
  const png = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#dddddd' } }).png().toBuffer()
  return png.toString('base64')
}

async function pixel(bytes: Buffer, x: number, y: number) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
  const at = (y * info.width + x) * info.channels
  return [data[at], data[at + 1], data[at + 2]]
}

describe('AI-generated pictures (IT Rules, rule 3(3))', () => {
  it('carry a visible label and say they are AI-made, with a unique ID, inside the file', async () => {
    const stored = await encodeForStorage(await modelPicture(), LOOK_ID)
    expect(stored.contentType).toBe('image/webp')

    // The dark label sits at the bottom left; the top right is untouched.
    const [r] = await pixel(stored.bytes, 60, 1536 - 50)
    expect(r).toBeLessThan(120)
    expect((await pixel(stored.bytes, 1000, 20))[0]).toBeGreaterThan(200)

    const meta = await sharp(stored.bytes).metadata()
    const xmp = meta.xmp?.toString() ?? ''
    expect(xmp).toContain('trainedAlgorithmicMedia')
    expect(xmp).toContain(`pp-${LOOK_ID}`)
    expect(meta.exif?.toString('latin1')).toContain('AI-generated image made with PottuPaarkalaam')
  })

  it('keep the label and the metadata when saved or shared as JPEG', async () => {
    const stored = await encodeForStorage(await modelPicture(), LOOK_ID)
    const jpeg = await toJpeg(new Blob([new Uint8Array(stored.bytes)]), LOOK_ID)
    const meta = await sharp(jpeg).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.xmp?.toString()).toContain('trainedAlgorithmicMedia')
    expect(meta.exif?.toString('latin1')).toContain(`pp-${LOOK_ID}`)
    expect((await pixel(jpeg, 60, 1536 - 50))[0]).toBeLessThan(120)
  })
})
