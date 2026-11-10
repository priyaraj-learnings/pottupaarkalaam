'use client'

import { useState } from 'react'

import { Button, formatWhen, Spinner, useToast } from '@/components/ui'
import { apiBlob, errorMessage } from '@/lib/client/api'
import { saveToGallery, shareImage } from '@/lib/client/share'
import type { LookView } from '@/lib/client/types'
import { categoryLabel, SOURCE_LABELS } from '@/lib/rules'

export function lookTitle(look: Pick<LookView, 'garments'>) {
  if (look.garments.some(garment => garment.role === 'HIS' || garment.role === 'HER')) {
    return look.garments.map(garment => `${garment.role === 'HIS' ? 'His' : 'Her'}: ${categoryLabel(garment.category)}`).join(' · ')
  }
  return look.garments.map(garment => categoryLabel(garment.category)).join(' + ')
}

function daysLeft(expiresAt: string) {
  const days = Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000)
  if (days <= 0) return 'Deletes today'
  return days === 1 ? 'Deletes tomorrow' : `Deletes in ${days} days`
}

// Save and Share for a finished picture (the card and the slideshow).
export function useLookActions(look: Pick<LookView, 'id'>) {
  const toast = useToast()
  const [busy, setBusy] = useState<'' | 'save' | 'share'>('')
  const fileName = `pottupaarkalaam-${look.id.slice(0, 8)}.jpg`

  async function save() {
    setBusy('save')
    try {
      const outcome = await saveToGallery(await apiBlob(`/api/try-ons/${look.id}/download`), fileName)
      if (outcome === 'downloaded') toast('Saved to your phone. Find it in Gallery or Photos (Downloads).')
      if (outcome === 'shared') toast('Saved.')
    } catch (saveError) {
      toast(errorMessage(saveError), 'error')
    } finally {
      setBusy('')
    }
  }

  async function share() {
    setBusy('share')
    try {
      const outcome = await shareImage(await apiBlob(`/api/try-ons/${look.id}/download`), fileName)
      if (outcome === 'whatsapp') toast('Picture saved. Attach it in the WhatsApp chat that opened.')
    } catch (shareError) {
      toast(errorMessage(shareError), 'error')
    } finally {
      setBusy('')
    }
  }

  return { busy, save, share }
}

export function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} shrink-0 fill-current`}>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" />
    </svg>
  )
}

// One try-on picture: making it, the result with Save and Share, or why it
// failed (its credits are already back). onOpen: tapping the picture opens it
// full screen (the slideshow).
export default function LookCard({ look, showDate = false, onRetry, onOpen }: { look: LookView; showDate?: boolean; onRetry?: () => void; onOpen?: () => void }) {
  const { busy, save, share } = useLookActions(look)

  const subtitle = look.garments.map(garment => SOURCE_LABELS[garment.source].split(' ')[0].toLowerCase()).join(' + ')

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200/70">
      <div className="relative aspect-[2/3] w-full bg-stone-100">
        {look.status === 'COMPLETED' && look.imageUrl ? (
          // Signed storage links change every hour, so next/image caching does not help here.
          onOpen ? (
            <button type="button" onClick={onOpen} aria-label={`Open ${lookTitle(look)} full screen`} className="block h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={look.imageUrl} alt={look.kind === 'COUPLE' ? `Couple picture (${lookTitle(look)})` : `You wearing the ${lookTitle(look).toLowerCase()}`} className="h-full w-full object-cover" />
              <span aria-hidden="true" className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold text-white">⤢</span>
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={look.imageUrl} alt={look.kind === 'COUPLE' ? `Couple picture (${lookTitle(look)})` : `You wearing the ${lookTitle(look).toLowerCase()}`} className="h-full w-full object-cover" />
          )
        ) : look.status === 'FAILED' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <span className="text-3xl" aria-hidden="true">😕</span>
            <p className="text-sm font-semibold text-stone-700">{look.error}</p>
          </div>
        ) : (
          <div className="pp-shimmer flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <Spinner className="h-8 w-8 text-brand-600" />
            <p className="text-sm font-bold text-brand-800">Making your picture…</p>
            <p className="text-xs text-stone-600">Usually 30 to 90 seconds. You can wait here or check My pictures later.</p>
          </div>
        )}
        {look.kind !== 'SINGLE' && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-brand-700">{look.kind === 'COUPLE' ? '💑 Couple' : 'Pair'}</span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div>
          <p className="line-clamp-2 text-sm font-extrabold">{lookTitle(look)}</p>
          <p className="truncate text-xs text-stone-500">
            {subtitle} · {look.credits} credit{look.credits === 1 ? '' : 's'}
            {look.status === 'FAILED' && look.refunded ? ' · returned' : ''}
          </p>
          {showDate && <p className="text-xs text-stone-500">{formatWhen(look.createdAt)} · {daysLeft(look.expiresAt)}</p>}
        </div>
        {look.status === 'COMPLETED' && (
          <div className="grid grid-cols-2 gap-2">
            <Button busy={busy === 'save'} disabled={busy !== ''} onClick={save} className="min-h-10 px-2 text-sm">Save</Button>
            <Button variant="whatsapp" busy={busy === 'share'} disabled={busy !== ''} onClick={share} title="Share on WhatsApp (or another app) with your invite link"
              aria-label="Share on WhatsApp" className="min-h-10 gap-1.5 px-2 text-sm"><WhatsAppIcon /> Share</Button>
          </div>
        )}
        {look.status === 'FAILED' && onRetry && (
          <Button variant="secondary" onClick={onRetry} className="min-h-10 w-full text-sm">Try again</Button>
        )}
      </div>
    </article>
  )
}
