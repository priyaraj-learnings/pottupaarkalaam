'use client'

import { useCallback, useEffect, useState } from 'react'

import { LookGallery } from '@/components/LookGallery'
import { Button, Notice, Spinner, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { isFinished, type LookView } from '@/lib/client/types'

// My pictures: everything from the last 3 days.
export default function History({ active, onTryOn }: { active: boolean; onTryOn: () => void }) {
  const toast = useToast()
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
    if (!window.confirm('Delete all your photos and pictures now? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api('/api/history', { method: 'DELETE' })
      toast('Your photos and pictures have been deleted.')
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
        <h1 className="text-2xl font-black">My pictures</h1>
        <p className="text-sm text-stone-600">From the last 3 days. Pictures are deleted after 3 days, so save the ones you like.</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {looks === null && !error && (
        <div className="flex justify-center py-12 text-brand-600"><Spinner className="h-8 w-8" /></div>
      )}
      {looks?.length === 0 && (
        <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-stone-200">
          <p className="text-4xl" aria-hidden="true">👗</p>
          <p className="mt-2 font-bold">No pictures yet</p>
          <p className="text-sm text-stone-500">Try something on and it will show here.</p>
          <Button onClick={onTryOn} className="mt-4">Try on</Button>
        </div>
      )}
      {looks && looks.length > 0 && (
        <>
          <LookGallery looks={looks} showDate />
          <Button variant="danger" busy={deleting} onClick={deleteAll} className="w-full">Delete all my photos now</Button>
        </>
      )}
    </div>
  )
}
