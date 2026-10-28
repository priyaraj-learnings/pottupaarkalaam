'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

import { Button, useToast } from '@/components/ui'

// The UPI QR with the amount filled in, and a button to save it, so it can be
// opened from the gallery in GPay / PhonePe / Paytm ("scan from photo") or
// scanned from another phone.
export default function UpiQr({ link, amountInr }: { link: string; amountInr: number }) {
  const toast = useToast()
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(link, { margin: 2, width: 640, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setDataUrl(url) })
      .catch(() => { if (!cancelled) setDataUrl(null) })
    return () => { cancelled = true }
  }, [link])

  function save() {
    if (!dataUrl) return
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = `pottupaarkalaam-pay-${amountInr}.png`
    anchor.click()
    toast('QR saved. In your UPI app, scan it from your gallery.')
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="aspect-square w-52 rounded-2xl bg-white p-2 ring-1 ring-stone-200" role="img" aria-label={`UPI QR code to pay ₹${amountInr}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {dataUrl && <img src={dataUrl} alt="" className="h-full w-full" />}
      </div>
      <Button variant="secondary" disabled={!dataUrl} onClick={save} className="min-h-10 text-sm">Save QR to gallery</Button>
    </div>
  )
}
