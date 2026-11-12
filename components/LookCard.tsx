'use client'

import { useState } from 'react'

import { Button, formatWhen, Spinner, useToast } from '@/components/ui'
import { apiBlob, errorMessage } from '@/lib/client/api'
import { saveToGallery, shareImage } from '@/lib/client/share'
import { useCategoryName, useSourceName } from '@/lib/client/categoryNames'
import { useLanguage, useT, type Translate } from '@/lib/client/language'
import type { LookView } from '@/lib/client/types'
import { categoryLabel, SOURCE_LABELS } from '@/lib/rules'

const english: Translate = en => en

// name: the garment names on screen (useCategoryName()); t: His / Her (useT()).
export function lookTitle(look: Pick<LookView, 'garments'>, name: (code: string) => string = categoryLabel, t: Translate = english) {
  if (look.garments.some(garment => garment.role === 'HIS' || garment.role === 'HER')) {
    return look.garments.map(garment => `${garment.role === 'HIS' ? t('His', 'ஆண்') : t('Her', 'பெண்')}: ${name(garment.category)}`).join(' · ')
  }
  return look.garments.map(garment => name(garment.category)).join(' + ')
}

function daysLeft(expiresAt: string, t: Translate) {
  const days = Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000)
  if (days <= 0) return t('Deletes today', 'இன்று நீக்கப்படும்')
  return days === 1 ? t('Deletes tomorrow', 'நாளை நீக்கப்படும்') : t(`Deletes in ${days} days`, `${days} நாட்களில் நீக்கப்படும்`)
}

// Save and Share for a finished picture (the card and the slideshow).
export function useLookActions(look: Pick<LookView, 'id'>) {
  const toast = useToast()
  const t = useT()
  const [busy, setBusy] = useState<'' | 'save' | 'share'>('')
  const fileName = `pottupaarkalaam-${look.id.slice(0, 8)}.jpg`

  async function save() {
    setBusy('save')
    try {
      const outcome = await saveToGallery(await apiBlob(`/api/try-ons/${look.id}/download`), fileName)
      if (outcome === 'downloaded') toast(t('Saved to your phone. Find it in Gallery or Photos (Downloads).', 'உங்கள் போனில் சேமிக்கப்பட்டது. கேலரி அல்லது Photos (Downloads)-இல் பாருங்கள்.'))
      if (outcome === 'shared') toast(t('Saved.', 'சேமிக்கப்பட்டது.'))
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
      if (outcome === 'whatsapp') toast(t('Picture saved. Attach it in the WhatsApp chat that opened.', 'படம் சேமிக்கப்பட்டது. திறந்த WhatsApp உரையாடலில் அதை இணைத்து அனுப்புங்கள்.'))
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
  const t = useT()
  const ta = useLanguage() === 'ta'
  const name = useCategoryName()
  const sourceName = useSourceName()
  const title = lookTitle(look, name, t)

  const subtitle = look.garments.map(garment => ta ? sourceName(garment.source) : SOURCE_LABELS[garment.source].split(' ')[0].toLowerCase()).join(' + ')
  const alt = look.kind === 'COUPLE'
    ? t(`Couple picture (${title})`, `ஜோடி படம் (${title})`)
    : t(`You wearing the ${title.toLowerCase()}`, `${title} அணிந்த நீங்கள்`)

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200/70">
      <div className="relative aspect-[2/3] w-full bg-stone-100">
        {look.status === 'COMPLETED' && look.imageUrl ? (
          // Signed storage links change every hour, so next/image caching does not help here.
          onOpen ? (
            <button type="button" onClick={onOpen} aria-label={t(`Open ${title} full screen`, `${title} படத்தை முழுத் திரையில் திற`)} className="block h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={look.imageUrl} alt={alt} className="h-full w-full object-cover" />
              <span aria-hidden="true" className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold text-white">⤢</span>
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={look.imageUrl} alt={alt} className="h-full w-full object-cover" />
          )
        ) : look.status === 'FAILED' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <span className="text-3xl" aria-hidden="true">😕</span>
            <p className="text-sm font-semibold text-stone-700">{look.error}</p>
          </div>
        ) : (
          <div className="pp-shimmer flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <Spinner className="h-8 w-8 text-brand-600" />
            <p className="text-sm font-bold text-brand-800">{t('Making your picture…', 'உங்கள் படம் தயாராகிறது…')}</p>
            <p className="text-xs text-stone-600">{t('Usually 30 to 90 seconds. You can wait here or check My pictures later.', 'பொதுவாக 30 முதல் 90 வினாடிகள் ஆகும். இங்கேயே காத்திருக்கலாம் அல்லது பிறகு என் படங்களில் பார்க்கலாம்.')}</p>
          </div>
        )}
        {look.kind !== 'SINGLE' && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-brand-700">{look.kind === 'COUPLE' ? t('💑 Couple', '💑 ஜோடி') : t('Pair', 'இணை')}</span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div>
          <p className="line-clamp-2 text-sm font-extrabold">{title}</p>
          <p className="truncate text-xs text-stone-500">
            {subtitle} · {look.credits === 1 ? t('1 credit', '1 கிரெடிட்') : t(`${look.credits} credits`, `${look.credits} கிரெடிட்கள்`)}
            {look.status === 'FAILED' && look.refunded ? t(' · returned', ' · திருப்பித் தரப்பட்டது') : ''}
          </p>
          {showDate && <p className="text-xs text-stone-500">{formatWhen(look.createdAt)} · {daysLeft(look.expiresAt, t)}</p>}
        </div>
        {look.status === 'COMPLETED' && (
          <div className="grid grid-cols-2 gap-2">
            <Button busy={busy === 'save'} disabled={busy !== ''} onClick={save} className="min-h-10 px-2 text-sm">{t('Save', 'சேமி')}</Button>
            <Button variant="whatsapp" busy={busy === 'share'} disabled={busy !== ''} onClick={share} title={t('Share on WhatsApp (or another app) with your invite link', 'உங்கள் அழைப்பு இணைப்புடன் WhatsApp-இல் (அல்லது வேறு செயலியில்) பகிருங்கள்')}
              aria-label={t('Share on WhatsApp', 'WhatsApp-இல் பகிர்')} className="min-h-10 gap-1.5 px-2 text-sm"><WhatsAppIcon /> {t('Share', 'பகிர்')}</Button>
          </div>
        )}
        {look.status === 'FAILED' && onRetry && (
          <Button variant="secondary" onClick={onRetry} className="min-h-10 w-full text-sm">{t('Try again', 'மீண்டும் முயற்சி செய்')}</Button>
        )}
      </div>
    </article>
  )
}
