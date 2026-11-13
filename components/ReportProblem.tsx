'use client'

import { useState, type FormEvent } from 'react'

import { Button, Notice, Sheet, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { useT } from '@/lib/client/language'

type Reason = 'FACE_CHANGED' | 'WRONG_GARMENT' | 'DISTORTED' | 'OTHER'

const REASONS: Array<{ value: Reason; en: string; ta: string }> = [
  { value: 'FACE_CHANGED', en: 'The face is not mine', ta: 'முகம் என்னுடையது இல்லை' },
  { value: 'WRONG_GARMENT', en: 'The garment is a different kind or colour', ta: 'உடை வேறு வகை அல்லது வேறு நிறத்தில் உள்ளது' },
  { value: 'DISTORTED', en: 'The picture is distorted or broken', ta: 'படம் சிதைந்து அல்லது உடைந்து உள்ளது' },
  { value: 'OTHER', en: 'Something else', ta: 'வேறு ஏதாவது' },
]

const NOTE_MAX = 500

// "Report a problem" with a finished picture. onSent: the report went in.
export default function ReportProblem({ lookId, open, onClose, onSent }: { lookId: string; open: boolean; onClose: () => void; onSent: () => void }) {
  const t = useT()
  const toast = useToast()
  const [reason, setReason] = useState<Reason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!reason) {
      setError(t('Choose what is wrong with the picture.', 'படத்தில் என்ன தவறு என்று தேர்ந்தெடுங்கள்.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await api(`/api/try-ons/${lookId}/problem`, { method: 'POST', json: { reason, note: note.trim() } })
      toast(t('Report sent', 'புகார் அனுப்பப்பட்டது'))
      onSent()
      onClose()
    } catch (sendError) {
      setError(errorMessage(sendError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title={t('Report a problem', 'பிரச்சனையைத் தெரிவி')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-bold text-stone-700">{t('What is wrong with the picture?', 'படத்தில் என்ன தவறு?')}</legend>
          {REASONS.map(option => (
            <label key={option.value} className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold ring-1 ${reason === option.value ? 'bg-brand-50 ring-brand-300' : 'ring-stone-200'}`}>
              <input type="radio" name="reason" value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)}
                className="h-5 w-5 shrink-0 accent-brand-600" />
              {t(option.en, option.ta)}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-bold text-stone-700">
          {t('Note (optional)', 'குறிப்பு (விருப்பம்)')}
          <textarea value={note} maxLength={NOTE_MAX} rows={3} onChange={event => setNote(event.target.value)}
            className="mt-1 block w-full rounded-2xl border border-stone-300 bg-white p-3 text-base font-normal" />
          <span className="mt-0.5 block text-right text-xs font-normal text-stone-500">{note.length}/{NOTE_MAX}</span>
        </label>
        <p className="text-sm text-stone-600">{t('We look at it within 2 days. If the picture is faulty, its credits come back.', '2 நாட்களுக்குள் இதைப் பார்ப்போம். படத்தில் தவறு இருந்தால், அதன் கிரெடிட்கள் திரும்ப வரும்.')}</p>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" busy={busy} className="w-full">{t('Send report', 'புகாரை அனுப்பு')}</Button>
      </form>
    </Sheet>
  )
}
