'use client'

import { shareMessage, whatsAppLink } from '@/lib/client/referral'

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

// WhatsApp (or Instagram...) through the phone's share sheet, with the words
// and the customer's invite link. Where pictures cannot be shared (most
// computers): saves the picture and opens WhatsApp with the words, to attach it.
export async function shareImage(blob: Blob, fileName: string, text = shareMessage()): Promise<'shared' | 'cancelled' | 'whatsapp'> {
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
  if (navigator.canShare?.({ files: [file], text })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
    }
  }
  await saveToGallery(blob, fileName)
  window.open(whatsAppLink(text), '_blank', 'noopener')
  return 'whatsapp'
}

// An invite without a picture: the share sheet, else WhatsApp.
export async function shareInvite(): Promise<'shared' | 'cancelled' | 'whatsapp'> {
  const text = shareMessage()
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
    }
  }
  window.open(whatsAppLink(text), '_blank', 'noopener')
  return 'whatsapp'
}
