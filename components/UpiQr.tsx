'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

import { Button, useToast } from '@/components/ui'
import { saveToGallery } from '@/lib/client/share'
import { tr, useT } from '@/lib/client/language'

// The saved picture: the QR with who is being paid and how much written on
// it, so it is easy to find in the gallery and pick from the UPI app.
async function labelledQr(link: string, amountInr: number, payee: string) {
  const qr = await QRCode.toDataURL(link, { margin: 2, width: 720, errorCorrectionLevel: 'M' })
  const image = new Image()
  image.src = qr
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 1000
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#1c1917'
  context.textAlign = 'center'
  context.font = 'bold 54px system-ui, sans-serif'
  context.fillText(tr(`Pay ₹${amountInr.toLocaleString('en-IN')}`, `₹${amountInr.toLocaleString('en-IN')} செலுத்துங்கள்`), 400, 90)
  context.font = '34px system-ui, sans-serif'
  context.fillText(tr(`to ${payee}`, `${payee}-க்கு`), 400, 145)
  context.drawImage(image, 40, 175, 720, 720)
  context.fillStyle = '#9d174d'
  context.font = 'bold 30px system-ui, sans-serif'
  context.fillText(tr('PottuPaarkalaam · scan with any UPI app', 'PottuPaarkalaam · எந்த UPI செயலியிலும் ஸ்கேன் செய்யுங்கள்'), 400, 950)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png'))
}

// The UPI QR with the amount filled in, and a button to save it, so it can be
// opened from the gallery in PhonePe / Paytm / Google Pay ("scan from photo")
// or scanned from another phone.
export default function UpiQr({ link, amountInr, payee, onSaved, primary = false }: {
  link: string
  amountInr: number
  payee: string
  onSaved?: () => void
  primary?: boolean
}) {
  const toast = useToast()
  const t = useT()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(link, { margin: 2, width: 640, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setDataUrl(url) })
      .catch(() => { if (!cancelled) setDataUrl(null) })
    return () => { cancelled = true }
  }, [link])

  async function save() {
    setSaving(true)
    try {
      const outcome = await saveToGallery(await labelledQr(link, amountInr, payee), `pay-${payee.replace(/\W+/g, '-')}-${amountInr}.png`)
      if (outcome === 'cancelled') return
      toast(outcome === 'shared'
        ? t('Saved. Now scan it from your UPI app.', 'சேமிக்கப்பட்டது. இப்போது உங்கள் UPI செயலியில் அதை ஸ்கேன் செய்யுங்கள்.')
        : t('QR saved to your phone. Now scan it from your UPI app.', 'QR உங்கள் போனில் சேமிக்கப்பட்டது. இப்போது உங்கள் UPI செயலியில் அதை ஸ்கேன் செய்யுங்கள்.'))
      onSaved?.()
    } catch {
      toast(t('The QR could not be saved. Take a screenshot of it instead.', 'QR-ஐச் சேமிக்க முடியவில்லை. அதற்குப் பதிலாக அதை ஸ்கிரீன்ஷாட் எடுங்கள்.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="aspect-square w-52 rounded-2xl bg-white p-2 ring-1 ring-stone-200" role="img" aria-label={t(`UPI QR code to pay ₹${amountInr}`, `₹${amountInr} செலுத்த UPI QR குறியீடு`)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {dataUrl && <img src={dataUrl} alt="" className="h-full w-full" />}
      </div>
      <Button variant={primary ? 'primary' : 'secondary'} busy={saving} disabled={!dataUrl} onClick={save} className={primary ? 'w-full' : 'min-h-10 text-sm'}>
        {t('⬇️ Save QR to gallery', '⬇️ QR-ஐ கேலரியில் சேமி')}
      </Button>
    </div>
  )
}
