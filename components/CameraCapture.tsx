'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useLanguage, useT } from '@/lib/client/language'

// The in-app camera: a live preview with Off / 3 / 5 / 10 second timers.
// Laptop and desktop browsers ignore <input capture> and open the file picker,
// so "Take photo" uses this everywhere. If the browser has no camera or the
// person blocks it, onFallback opens the phone's own camera app (or the file
// picker) instead.

export type Facing = 'user' | 'environment'

const TIMERS = [0, 3, 5, 10] as const
const TIMER_KEY = 'pp-camera-timer'

function savedTimer(): number {
  try {
    const value = Number(localStorage.getItem(TIMER_KEY))
    return (TIMERS as readonly number[]).includes(value) ? value : 0
  } catch {
    return 0
  }
}

export function cameraAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

type CameraProps = {
  open: boolean
  title: string
  facing: Facing
  onCapture: (file: File) => void
  onClose: () => void
  onFallback: () => void
}

// Mounted only while open, so every opening starts fresh.
export function CameraCapture(props: CameraProps) {
  return props.open ? <CameraView {...props} /> : null
}

function CameraView({ title, facing: startFacing, onCapture, onClose, onFallback }: CameraProps) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const [facing, setFacing] = useState<Facing>(startFacing)
  const [timer, setTimer] = useState<number>(savedTimer)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [flash, setFlash] = useState(false)
  // What went wrong ('' when nothing), shown in the chosen language.
  const [error, setError] = useState<'' | 'blocked' | 'missing' | 'failed' | 'capture'>('')
  const t = useT()
  const ta = useLanguage() === 'ta'
  const [canSwitch, setCanSwitch] = useState(false)

  const stopCountdown = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current)
    ticker.current = null
    setCountdown(null)
  }, [])

  // Start the camera (again after switching between front and back).
  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
      audio: false,
    }).then(async media => {
      if (cancelled) {
        media.getTracks().forEach(track => track.stop())
        return
      }
      stream.current = media
      if (video.current) {
        video.current.srcObject = media
        await video.current.play().catch(() => {})
      }
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      if (!cancelled) setCanSwitch(devices.filter(device => device.kind === 'videoinput').length > 1)
    }).catch((cameraError: unknown) => {
      if (cancelled) return
      const name = cameraError instanceof DOMException ? cameraError.name : ''
      setError(name === 'NotAllowedError' ? 'blocked'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing'
          : 'failed')
    })
    return () => {
      cancelled = true
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null
    }
  }, [facing])

  useEffect(() => stopCountdown, [stopCountdown])

  function switchCamera() {
    setReady(false)
    setError('')
    setFacing(current => (current === 'user' ? 'environment' : 'user'))
  }

  const takeNow = useCallback(() => {
    const element = video.current
    if (!element || !element.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = element.videoWidth
    canvas.height = element.videoHeight
    canvas.getContext('2d')?.drawImage(element, 0, 0)
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
    navigator.vibrate?.(40)
    canvas.toBlob(blob => {
      if (!blob) {
        setError('capture')
        return
      }
      onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }, [onCapture])

  function shutter() {
    if (countdown !== null) {
      stopCountdown()
      return
    }
    if (!timer) {
      takeNow()
      return
    }
    let left = timer
    setCountdown(left)
    ticker.current = setInterval(() => {
      left -= 1
      if (left <= 0) {
        stopCountdown()
        takeNow()
      } else {
        setCountdown(left)
        navigator.vibrate?.(15)
      }
    }, 1000)
  }

  function chooseTimer(seconds: number) {
    setTimer(seconds)
    try {
      localStorage.setItem(TIMER_KEY, String(seconds))
    } catch {
      // Private mode: just not remembered.
    }
  }

  const mirrored = facing === 'user'
  const errorText = {
    '': '',
    blocked: t('The camera is blocked for this site. Allow it in your browser’s site settings, or use another way below.',
      'இந்தத் தளத்துக்குக் கேமரா தடுக்கப்பட்டுள்ளது. உங்கள் பிரவுசரின் தள அமைப்புகளில் அனுமதி கொடுங்கள், அல்லது கீழே உள்ள வேறு வழியைப் பயன்படுத்துங்கள்.'),
    missing: t('No camera was found on this device.', 'இந்தச் சாதனத்தில் கேமரா எதுவும் இல்லை.'),
    failed: t('The camera could not be started. Close other apps using it and try again, or use another way below.',
      'கேமராவைத் தொடங்க முடியவில்லை. அதைப் பயன்படுத்தும் மற்ற செயலிகளை மூடிவிட்டு மீண்டும் முயற்சி செய்யுங்கள், அல்லது கீழே உள்ள வேறு வழியைப் பயன்படுத்துங்கள்.'),
    capture: t('The photo could not be taken. Please try again.', 'புகைப்படம் எடுக்க முடியவில்லை. மீண்டும் முயற்சி செய்யுங்கள்.'),
  }[error]

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={t('Close camera', 'கேமராவை மூடு')} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg">✕</button>
        <span className="min-w-0 truncate text-sm font-bold">{title}</span>
        {canSwitch ? (
          <button type="button" onClick={switchCamera} aria-label={t('Switch camera', 'கேமராவை மாற்று')}
            disabled={countdown !== null} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg disabled:opacity-40">🔄</button>
        ) : <span className="w-10" />}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted autoPlay onLoadedData={() => setReady(true)}
          className={`h-full w-full object-contain ${mirrored ? '-scale-x-100' : ''}`} />
        {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">{t('Starting the camera…', 'கேமரா தொடங்குகிறது…')}</p>}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-[15px]">{errorText}</p>
            <button type="button" onClick={onFallback} className="rounded-2xl bg-white px-4 py-3 font-bold text-brand-800">{t('Use the phone camera or choose a photo', 'போன் கேமராவைப் பயன்படுத்து அல்லது புகைப்படத்தைத் தேர்ந்தெடு')}</button>
          </div>
        )}
        {countdown !== null && (
          <span aria-live="assertive" className="absolute inset-0 flex items-center justify-center text-[8rem] font-black drop-shadow-lg">{countdown}</span>
        )}
        {flash && <span className="absolute inset-0 bg-white" />}
      </div>

      <div className="space-y-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div role="radiogroup" aria-label={t('Timer', 'டைமர்')} className="mx-auto grid max-w-xs grid-cols-4 gap-1 rounded-full bg-white/10 p-1">
          {TIMERS.map(seconds => (
            <button key={seconds} type="button" role="radio" aria-checked={timer === seconds} disabled={countdown !== null}
              onClick={() => chooseTimer(seconds)}
              className={`min-h-9 rounded-full text-sm font-bold ${timer === seconds ? 'bg-white text-stone-900' : 'text-white/80'}`}>
              {seconds ? t(`${seconds}s`, `${seconds} வி`) : t('No timer', 'டைமர் இல்லை')}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center">
          <button type="button" onClick={shutter} disabled={!ready} aria-label={countdown !== null ? t('Cancel timer', 'டைமரை ரத்து செய்') : timer ? t(`Take photo in ${timer} seconds`, `${timer} விநாடிகளில் புகைப்படம் எடு`) : t('Take photo', 'புகைப்படம் எடு')}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white disabled:opacity-40">
            <span className={`block rounded-full ${countdown !== null ? 'h-8 w-8 rounded-md bg-red-500' : 'h-16 w-16 bg-white'}`} />
          </button>
        </div>
        {!error && (
          <button type="button" onClick={onFallback} className="mx-auto block text-xs font-semibold text-white/70 underline">
            {ta ? 'இதற்குப் பதில் போனின் கேமரா செயலியைப் பயன்படுத்து' : <>Use the phone&rsquo;s camera app instead</>}
          </button>
        )}
      </div>
    </div>
  )
}
