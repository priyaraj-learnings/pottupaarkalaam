'use client'

// A phone photo (often 12+ MP and several MB) as a smaller JPEG, so uploads
// are quick on mobile data. The browser applies the camera's rotation.
export async function shrinkPhoto(file: Blob, maxSide = 1600, quality = 0.88): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('This photo could not be opened. Please choose a JPG or PNG photo.'))
      element.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare the photo.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Unable to prepare the photo.'))), 'image/jpeg', quality)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
