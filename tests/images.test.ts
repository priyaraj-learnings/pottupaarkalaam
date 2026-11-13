import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { validatePhoto } from '@/lib/server/images'

describe('stored photos', () => {
  it('keep no GPS or other EXIF details, and are upright JPEGs', async () => {
    const withExif = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#c2185b' } })
      .jpeg().withMetadata({ orientation: 6 }).withExifMerge({ IFD0: { Make: 'PhoneMaker' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '13/1 4/1 0/1' } }).toBuffer()
    expect(await sharp(withExif).metadata()).toMatchObject({ orientation: 6 })
    expect((await sharp(withExif).metadata()).exif).toBeDefined()
    const stored = await validatePhoto(new File([withExif], 'selfie.jpg', { type: 'image/jpeg' }), 'photo')
    const metadata = await sharp(stored.bytes).metadata()
    expect(metadata.exif).toBeUndefined()
    expect(metadata.format).toBe('jpeg')
    // Orientation 6 (turned 90°) is applied: 40x20 becomes 20x40.
    expect([metadata.width, metadata.height]).toEqual([20, 40])
    expect(stored.extension).toBe('jpg')
  })
})
