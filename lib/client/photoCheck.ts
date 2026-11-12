'use client'

import type { Translate } from '@/lib/client/language'

// A quick check of the customer's own photo, on the phone, before any credit
// is spent: big enough, not too dark or too bright, not blurred, and (where
// the browser can find faces) one face that is not tiny. Only a warning: the
// customer can still use the photo.

export type PhotoProblem = 'SMALL' | 'DARK' | 'BRIGHT' | 'BLURRY' | 'NO_FACE' | 'MANY_FACES' | 'FACE_SMALL'

type FaceDetectorLike = { detect: (image: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>> }
type FaceDetectorClass = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike

// Grey levels (0-255) of a picture scaled to `size` on its longer side.
function greys(image: ImageBitmap, size: number) {
  const scale = Math.min(1, size / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  const grey = new Float32Array(width * height)
  for (let index = 0; index < grey.length; index += 1) {
    grey[index] = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2]
  }
  return { grey, width, height }
}

// Brightness and sharpness from grey levels (exported for tests).
export function measure(grey: Float32Array, width: number, height: number) {
  let sum = 0
  for (const value of grey) sum += value
  const brightness = sum / grey.length
  // Variance of the Laplacian: low when the photo is blurred.
  let count = 0
  let mean = 0
  let squares = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = y * width + x
      const value = 4 * grey[at] - grey[at - 1] - grey[at + 1] - grey[at - width] - grey[at + width]
      count += 1
      mean += value
      squares += value * value
    }
  }
  mean = count ? mean / count : 0
  const sharpness = count ? squares / count - mean * mean : 0
  return { brightness, sharpness }
}

export function problemsFrom(input: { width: number; height: number; brightness: number; sharpness: number; faces: number | null; faceShare: number | null }): PhotoProblem[] {
  const problems: PhotoProblem[] = []
  if (Math.min(input.width, input.height) < 480) problems.push('SMALL')
  if (input.brightness < 55) problems.push('DARK')
  if (input.brightness > 225) problems.push('BRIGHT')
  if (input.sharpness < 20) problems.push('BLURRY')
  if (input.faces === 0) problems.push('NO_FACE')
  if (input.faces !== null && input.faces > 1) problems.push('MANY_FACES')
  if (input.faces === 1 && input.faceShare !== null && input.faceShare < 0.035) problems.push('FACE_SMALL')
  return problems
}

export async function checkPersonPhoto(blob: Blob): Promise<PhotoProblem[]> {
  try {
    const image = await createImageBitmap(blob)
    try {
      const pixels = greys(image, 512)
      if (!pixels) return []
      const { brightness, sharpness } = measure(pixels.grey, pixels.width, pixels.height)
      let faces: number | null = null
      let faceShare: number | null = null
      const Detector = (window as Window & { FaceDetector?: FaceDetectorClass }).FaceDetector
      if (Detector) {
        try {
          const found = await new Detector({ fastMode: true, maxDetectedFaces: 5 }).detect(image)
          faces = found.length
          faceShare = found.length === 1 ? found[0].boundingBox.width / image.width : null
        } catch {
          // Face finding is not available on this phone after all.
        }
      }
      return problemsFrom({ width: image.width, height: image.height, brightness, sharpness, faces, faceShare })
    } finally {
      image.close()
    }
  } catch {
    return []
  }
}

export function problemText(problem: PhotoProblem, t: Translate) {
  switch (problem) {
    case 'SMALL': return t('The photo is very small: the picture may come out unclear.', 'புகைப்படம் மிகச் சிறியது: படம் தெளிவாக வராமல் போகலாம்.')
    case 'DARK': return t('The photo is dark: take it facing a window or in good light.', 'புகைப்படம் இருட்டாக உள்ளது: ஜன்னலை நோக்கி அல்லது நல்ல வெளிச்சத்தில் எடுங்கள்.')
    case 'BRIGHT': return t('The photo is too bright: move out of direct sunlight.', 'புகைப்படம் மிகவும் பிரகாசமாக உள்ளது: நேரடி வெயிலிலிருந்து விலகி எடுங்கள்.')
    case 'BLURRY': return t('The photo looks blurred: hold the phone still and try again.', 'புகைப்படம் மங்கலாகத் தெரிகிறது: போனை அசையாமல் பிடித்து மீண்டும் எடுங்கள்.')
    case 'NO_FACE': return t('We could not find a face: face the camera.', 'முகம் தெரியவில்லை: கேமராவை நோக்கி நில்லுங்கள்.')
    case 'MANY_FACES': return t('There is more than one person: use a photo of just you.', 'ஒருவருக்கு மேல் இருக்கிறார்கள்: நீங்கள் மட்டும் உள்ள புகைப்படத்தைப் பயன்படுத்துங்கள்.')
    case 'FACE_SMALL': return t('You are far away in the photo: take it a little closer.', 'புகைப்படத்தில் நீங்கள் தொலைவில் இருக்கிறீர்கள்: சற்று அருகில் எடுங்கள்.')
  }
}
