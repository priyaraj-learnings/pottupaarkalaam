'use client'

const SHARE_TEXT = 'I tried this on with PottuPaarkalaam: pp.inaivuit.com'

function isApple() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isCancel(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

// iPhone: the share sheet, where "Save Image" puts it in Photos. Android and
// computers: a download, which appears in the Gallery / Photos app under
// Downloads. Returns what happened, for the message on screen.
export async function saveToGallery(blob: Blob, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
  if (isApple() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'downloaded'
}

// WhatsApp, Instagram... through the phone's share sheet.
export async function shareImage(blob: Blob, fileName: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported'
  try {
    await navigator.share({ files: [file], text: SHARE_TEXT })
    return 'shared'
  } catch (error) {
    return isCancel(error) ? 'cancelled' : 'unsupported'
  }
}
