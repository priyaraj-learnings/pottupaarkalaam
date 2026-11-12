'use client'

import { useCallback, useEffect, useState } from 'react'

import { LookGallery } from '@/components/LookGallery'
import { Button, Notice, Spinner, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { useT } from '@/lib/client/language'
import { isFinished, type LookView } from '@/lib/client/types'

// My pictures: everything from the last 3 days.
export default function History({ active, onTryOn }: { active: boolean; onTryOn: () => void }) {
  const toast = useToast()
  const t = useT()
  const [looks, setLooks] = useState<LookView[] | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api<{ looks: LookView[] }>('/api/history')
      setLooks(result.looks)
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [])

  // Refreshed each time the tab is opened, and every few seconds while a
  // picture is still being made.
  const making = looks?.some(look => !isFinished(look)) ?? false
  useEffect(() => {
    if (!active) return
    const first = setTimeout(load, 0)
    const timer = making ? setInterval(load, 5000) : undefined
    return () => {
      clearTimeout(first)
      if (timer) clearInterval(timer)
    }
  }, [active, making, load])

  async function deleteAll() {
    if (!window.confirm(t('Delete all your photos and pictures now? This cannot be undone.', 'உங்கள் எல்லா புகைப்படங்களையும் படங்களையும் இப்போதே நீக்கவா? இதைத் திரும்பப் பெற முடியாது.'))) return
    setDeleting(true)
    try {
      await api('/api/history', { method: 'DELETE' })
      toast(t('Your photos and pictures have been deleted.', 'உங்கள் புகைப்படங்களும் படங்களும் நீக்கப்பட்டன.'))
      await load()
    } catch (deleteError) {
      toast(errorMessage(deleteError), 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">{t('My pictures', 'என் படங்கள்')}</h1>
        <p className="text-sm text-stone-600">{t('From the last 3 days. Pictures are deleted after 3 days, so save the ones you like.', 'கடந்த 3 நாட்களின் படங்கள். படங்கள் 3 நாட்களுக்குப் பிறகு நீக்கப்படும், அதனால் பிடித்தவற்றைச் சேமித்துக்கொள்ளுங்கள்.')}</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {looks === null && !error && (
        <div className="flex justify-center py-12 text-brand-600"><Spinner className="h-8 w-8" /></div>
      )}
      {looks?.length === 0 && (
        <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-stone-200">
          <p className="text-4xl" aria-hidden="true">👗</p>
          <p className="mt-2 font-bold">{t('No pictures yet', 'இன்னும் படங்கள் இல்லை')}</p>
          <p className="text-sm text-stone-500">{t('Try something on and it will show here.', 'ஏதாவது ஒன்றை அணிந்து பாருங்கள், அது இங்கே தெரியும்.')}</p>
          <Button onClick={onTryOn} className="mt-4">{t('Try on', 'அணிந்து பார்')}</Button>
        </div>
      )}
      {looks && looks.length > 0 && (
        <>
          <LookGallery looks={looks} showDate />
          <Button variant="danger" busy={deleting} onClick={deleteAll} className="w-full">{t('Delete all my photos now', 'என் எல்லா புகைப்படங்களையும் இப்போதே நீக்கு')}</Button>
        </>
      )}
    </div>
  )
}
