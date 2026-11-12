'use client'

import { useEffect, useState } from 'react'

import { Button, useToast } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useT } from '@/lib/client/language'
import { enablePush, pushState, type PushState } from '@/lib/client/notify'

// While pictures are being made: "Tell me when it's ready" (a phone
// notification), so customers can leave and still come back.
export function ReadyAlert({ making }: { making: boolean }) {
  const t = useT()
  const toast = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    pushState().then(next => { if (!cancelled) setState(next) }).catch(() => setState('unsupported'))
    return () => { cancelled = true }
  }, [])

  if (!making || state === null || state === 'unsupported' || state === 'denied') return null
  if (state === 'on') {
    return <p className="text-center text-xs font-semibold text-emerald-700">🔔 {t('We will notify you when it is ready.', 'தயாரானதும் உங்களுக்குத் தெரிவிப்போம்.')}</p>
  }

  async function turnOn() {
    setBusy(true)
    try {
      const next = await enablePush(t)
      setState(next)
      if (next === 'on') toast(t('Done: we will notify you when your pictures are ready.', 'சரி: படங்கள் தயாரானதும் தெரிவிப்போம்.'))
      if (next === 'denied') toast(t('Notifications are blocked for this site in your browser settings.', 'உங்கள் உலாவி அமைப்புகளில் இந்தத் தளத்துக்கு அறிவிப்புகள் தடுக்கப்பட்டுள்ளன.'), 'error')
    } catch (pushError) {
      toast(errorMessage(pushError), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-marigold-50 p-3 ring-1 ring-marigold-200">
      <span className="text-2xl" aria-hidden="true">🔔</span>
      <p className="min-w-0 flex-1 text-sm text-marigold-900">
        {t('Takes about a minute. Get a notification when it is ready?', 'சுமார் ஒரு நிமிடம் ஆகும். தயாரானதும் அறிவிப்பு வேண்டுமா?')}
      </p>
      <Button variant="secondary" busy={busy} onClick={() => void turnOn()} className="min-h-10 shrink-0 px-3 text-sm">
        {t('Notify me', 'தெரிவி')}
      </Button>
    </div>
  )
}
