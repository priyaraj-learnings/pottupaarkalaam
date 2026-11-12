import { describe, expect, it } from 'vitest'

import { measure, problemsFrom } from '@/lib/client/photoCheck'

const base = { width: 1200, height: 1600, brightness: 130, sharpness: 200, faces: 1, faceShare: 0.2 }

describe('photo check', () => {
  it('passes a good photo', () => {
    expect(problemsFrom(base)).toEqual([])
    expect(problemsFrom({ ...base, faces: null, faceShare: null })).toEqual([])
  })

  it('names each problem', () => {
    expect(problemsFrom({ ...base, width: 400 })).toEqual(['SMALL'])
    expect(problemsFrom({ ...base, brightness: 30 })).toEqual(['DARK'])
    expect(problemsFrom({ ...base, brightness: 240 })).toEqual(['BRIGHT'])
    expect(problemsFrom({ ...base, sharpness: 5 })).toEqual(['BLURRY'])
    expect(problemsFrom({ ...base, faces: 0, faceShare: null })).toEqual(['NO_FACE'])
    expect(problemsFrom({ ...base, faces: 3, faceShare: null })).toEqual(['MANY_FACES'])
    expect(problemsFrom({ ...base, faceShare: 0.02 })).toEqual(['FACE_SMALL'])
  })

  it('measures brightness and finds a blurred (flat) photo', () => {
    const flat = new Float32Array(100 * 100).fill(120)
    expect(measure(flat, 100, 100)).toEqual({ brightness: 120, sharpness: 0 })
    const checks = new Float32Array(100 * 100).map((_, index) => ((index % 100) + Math.floor(index / 100)) % 2 ? 255 : 0)
    expect(measure(checks, 100, 100).sharpness).toBeGreaterThan(1000)
  })
})
