'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { lookTitle, useLookActions } from '@/components/LookCard'
import { Button } from '@/components/ui'
import type { LookView } from '@/lib/client/types'

// The finished pictures full screen, one at a time: ◀ ▶ buttons, swiping,
// the keyboard's arrow keys, and Save / Share for the picture on screen. The
// phone's back button closes it.
export function Slideshow({ looks, start, onClose }: { looks: LookView[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), looks.length - 1))
  const touchX = useRef<number | null>(null)
  const look = looks[index]
  const { busy, save, share } = useLookActions(look)

  const previous = useCallback(() => setIndex(current => Math.max(0, current - 1)), [])
  const next = useCallback(() => setIndex(current => Math.min(looks.length - 1, current + 1)), [looks.length])

  useEffect(() => {
    window.history.pushState({ ppSlideshow: true }, '')
    const onPop = () => onClose()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') previous()
      if (event.key === 'ArrowRight') next()
      if (event.key === 'Escape') window.history.back()
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose, previous, next])

  if (!look?.imageUrl) return null
  const arrow = 'absolute top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-3xl font-bold text-white ring-1 ring-white/30 backdrop-blur disabled:opacity-0'

  return (
    <div role="dialog" aria-modal="true" aria-label="Pictures, full screen" className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button type="button" onClick={() => window.history.back()} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg">✕</button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-bold">{lookTitle(look)}</p>
          <p className="text-xs text-white/70" aria-live="polite">{index + 1} / {looks.length}</p>
        </div>
        <span className="w-10 shrink-0" />
      </div>

      <div
        className="relative min-h-0 flex-1 touch-pan-y select-none"
        onTouchStart={event => { touchX.current = event.touches[0]?.clientX ?? null }}
        onTouchEnd={event => {
          const startX = touchX.current
          touchX.current = null
          const endX = event.changedTouches[0]?.clientX
          if (startX === null || endX === undefined || Math.abs(endX - startX) < 50) return
          if (endX < startX) next()
          else previous()
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={look.id} src={look.imageUrl} alt={lookTitle(look)} className="h-full w-full object-contain" draggable={false} />
        {looks.length > 1 && (
          <>
            <button type="button" onClick={previous} disabled={index === 0} aria-label="Previous picture" className={`${arrow} left-2`}>‹</button>
            <button type="button" onClick={next} disabled={index === looks.length - 1} aria-label="Next picture" className={`${arrow} right-2`}>›</button>
          </>
        )}
        {/* The neighbours load in the background, so moving is instant. */}
        {[looks[index - 1], looks[index + 1]].map(neighbour => neighbour?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`preload-${neighbour.id}`} src={neighbour.imageUrl} alt="" className="hidden" />
        ))}
      </div>

      <div className="space-y-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {looks.length > 1 && (
          <div className="flex justify-center gap-1.5" aria-hidden="true">
            {looks.map((item, position) => (
              <button key={item.id} type="button" tabIndex={-1} onClick={() => setIndex(position)}
                className={`h-2 rounded-full transition-all ${position === index ? 'w-6 bg-white' : 'w-2 bg-white/40'}`} />
            ))}
          </div>
        )}
        <div className="mx-auto grid max-w-sm grid-cols-2 gap-2">
          <Button busy={busy === 'save'} disabled={busy !== ''} onClick={save}>Save</Button>
          <Button variant="secondary" busy={busy === 'share'} disabled={busy !== ''} onClick={share} className="bg-white/10 text-white ring-0">Share</Button>
        </div>
      </div>
    </div>
  )
}
