'use client'

import { useState } from 'react'

import { WhatsAppIcon } from '@/components/LookCard'
import { Button, Sheet, useToast } from '@/components/ui'
import { apiBlob, errorMessage } from '@/lib/client/api'
import { makeCollage } from '@/lib/client/collage'
import { useT } from '@/lib/client/language'
import { voteMessage } from '@/lib/client/referral'
import { shareImage } from '@/lib/client/share'
import type { LookView } from '@/lib/client/types'

// "Help me choose": the customer picks 2 to 4 finished pictures, and one
// numbered picture goes to WhatsApp with "Reply 1, 2 or 3".
export function VoteShare({ looks }: { looks: LookView[] }) {
  const t = useT()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  if (looks.length < 2) return null

  function start() {
    setPicked(looks.slice(0, 4).map(look => look.id))
    setOpen(true)
  }

  function toggle(id: string) {
    setPicked(current => current.includes(id)
      ? current.filter(item => item !== id)
      : current.length >= 4 ? current : [...current, id])
  }

  async function share() {
    setBusy(true)
    try {
      const chosen = looks.filter(look => picked.includes(look.id))
      const blobs = await Promise.all(chosen.map(look => apiBlob(`/api/try-ons/${look.id}/download`)))
      const collage = await makeCollage(blobs, t('Which one should I pick?', 'எதைத் தேர்ந்தெடுக்கலாம்?'),
        t('AI-generated pictures · PottuPaarkalaam', 'AI உருவாக்கிய படங்கள் · PottuPaarkalaam'))
      const outcome = await shareImage(collage, 'pottupaarkalaam-choose.jpg', voteMessage(chosen.length))
      if (outcome === 'whatsapp') toast(t('Picture saved. Attach it in the WhatsApp chat that opened.', 'படம் சேமிக்கப்பட்டது. திறந்த WhatsApp உரையாடலில் அதை இணையுங்கள்.'))
      if (outcome !== 'cancelled') setOpen(false)
    } catch (shareError) {
      toast(errorMessage(shareError), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="whatsapp" onClick={start} className="min-h-11 w-full text-sm">
        <WhatsAppIcon /> {t('Help me choose: ask family on WhatsApp', 'தேர்ந்தெடுக்க உதவுங்கள்: குடும்பத்திடம் WhatsApp-இல் கேளுங்கள்')}
      </Button>
      <Sheet open={open} title={t('Help me choose', 'தேர்ந்தெடுக்க உதவுங்கள்')} onClose={() => setOpen(false)}>
        <p className="mb-3 text-sm text-stone-600">
          {t('Pick 2 to 4 pictures. They go as one numbered picture, and family replies 1, 2, 3 or 4.',
            '2 முதல் 4 படங்களைத் தேர்ந்தெடுங்கள். அவை எண்ணிட்ட ஒரே படமாகச் செல்லும்; குடும்பத்தினர் 1, 2, 3 அல்லது 4 என்று பதில் அனுப்புவார்கள்.')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {looks.map(look => {
            const position = picked.indexOf(look.id)
            return (
              <button key={look.id} type="button" onClick={() => toggle(look.id)} aria-pressed={position >= 0}
                className={`relative aspect-[2/3] overflow-hidden rounded-2xl ring-2 ${position >= 0 ? 'ring-brand-600' : 'ring-transparent opacity-60'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={look.imageUrl ?? ''} alt="" className="h-full w-full object-cover" />
                {position >= 0 && (
                  <span className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-sm font-black text-white ring-2 ring-white">
                    {position + 1}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <Button variant="whatsapp" busy={busy} disabled={picked.length < 2} onClick={() => void share()} className="mt-4 w-full">
          <WhatsAppIcon /> {t(`Send ${picked.length} pictures`, `${picked.length} படங்களை அனுப்பு`)}
        </Button>
      </Sheet>
    </>
  )
}
