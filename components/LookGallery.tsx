'use client'

import { useCallback, useState } from 'react'

import LookCard from '@/components/LookCard'
import { Slideshow } from '@/components/Slideshow'
import { Button } from '@/components/ui'
import type { LookView } from '@/lib/client/types'

// The pictures as a grid (as before), with "Slideshow" and a tap on any
// finished picture opening them full screen.
export function LookGallery({ looks, showDate = false, onRetry }: {
  looks: LookView[]
  showDate?: boolean
  onRetry?: (look: LookView) => (() => void) | undefined
}) {
  const [open, setOpen] = useState<number | null>(null)
  const finished = looks.filter(look => look.status === 'COMPLETED' && look.imageUrl)
  const close = useCallback(() => setOpen(null), [])

  return (
    <div className="space-y-3">
      {finished.length > 0 && (
        <Button variant="secondary" onClick={() => setOpen(0)} className="min-h-10 w-full text-sm">
          ▶ Slideshow{finished.length > 1 ? ` (${finished.length} pictures)` : ''}
        </Button>
      )}
      <div className="grid grid-cols-2 gap-3">
        {looks.map(look => {
          const position = finished.findIndex(item => item.id === look.id)
          return (
            <LookCard key={look.id} look={look} showDate={showDate} onRetry={onRetry?.(look)}
              onOpen={position >= 0 ? () => setOpen(position) : undefined} />
          )
        })}
      </div>
      {open !== null && finished.length > 0 && <Slideshow looks={finished} start={open} onClose={close} />}
    </div>
  )
}
