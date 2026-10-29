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

// One try-on picture: making it, the result with Save and Share, or why it
// failed (its credits are already back).
export default function LookCard({ look, showDate = false, onRetry }: { look: LookView; showDate?: boolean; onRetry?: () => void }) {
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
      if (outcome === 'unsupported') toast('Sharing is not supported here. Save the picture and share it from your gallery.')
    } catch (shareError) {
      toast(errorMessage(shareError), 'error')
    } finally {
      setBusy('')
    }
  }

  const subtitle = look.garments.map(garment => SOURCE_LABELS[garment.source].split(' ')[0].toLowerCase()).join(' + ')

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200/70">
      <div className="relative aspect-[2/3] w-full bg-stone-100">
        {look.status === 'COMPLETED' && look.imageUrl ? (
          // Signed storage links change every hour, so next/image caching does not help here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={look.imageUrl} alt={look.kind === 'COUPLE' ? `Couple picture (${lookTitle(look)})` : `You wearing the ${lookTitle(look).toLowerCase()}`} className="h-full w-full object-cover" />
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
            <Button variant="secondary" busy={busy === 'share'} disabled={busy !== ''} onClick={share} className="min-h-10 px-2 text-sm">Share</Button>
          </div>
        )}
        {look.status === 'FAILED' && onRetry && (
          <Button variant="secondary" onClick={onRetry} className="min-h-10 w-full text-sm">Try again</Button>
        )}
      </div>
    </article>
  )
}
