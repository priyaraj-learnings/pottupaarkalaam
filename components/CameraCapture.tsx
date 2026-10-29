'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
  const [error, setError] = useState('')
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
      setError(name === 'NotAllowedError'
        ? 'The camera is blocked for this site. Allow it in your browser’s site settings, or use another way below.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'No camera was found on this device.'
          : 'The camera could not be started. Close other apps using it and try again, or use another way below.')
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
        setError('The photo could not be taken. Please try again.')
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

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close camera" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg">✕</button>
        <span className="min-w-0 truncate text-sm font-bold">{title}</span>
        {canSwitch ? (
          <button type="button" onClick={switchCamera} aria-label="Switch camera"
            disabled={countdown !== null} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg disabled:opacity-40">🔄</button>
        ) : <span className="w-10" />}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted autoPlay onLoadedData={() => setReady(true)}
          className={`h-full w-full object-contain ${mirrored ? '-scale-x-100' : ''}`} />
        {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting the camera…</p>}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-[15px]">{error}</p>
            <button type="button" onClick={onFallback} className="rounded-2xl bg-white px-4 py-3 font-bold text-brand-800">Use the phone camera or choose a photo</button>
          </div>
        )}
        {countdown !== null && (
          <span aria-live="assertive" className="absolute inset-0 flex items-center justify-center text-[8rem] font-black drop-shadow-lg">{countdown}</span>
        )}
        {flash && <span className="absolute inset-0 bg-white" />}
      </div>

      <div className="space-y-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div role="radiogroup" aria-label="Timer" className="mx-auto grid max-w-xs grid-cols-4 gap-1 rounded-full bg-white/10 p-1">
          {TIMERS.map(seconds => (
            <button key={seconds} type="button" role="radio" aria-checked={timer === seconds} disabled={countdown !== null}
              onClick={() => chooseTimer(seconds)}
              className={`min-h-9 rounded-full text-sm font-bold ${timer === seconds ? 'bg-white text-stone-900' : 'text-white/80'}`}>
              {seconds ? `${seconds}s` : 'No timer'}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center">
          <button type="button" onClick={shutter} disabled={!ready} aria-label={countdown !== null ? 'Cancel timer' : timer ? `Take photo in ${timer} seconds` : 'Take photo'}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white disabled:opacity-40">
            <span className={`block rounded-full ${countdown !== null ? 'h-8 w-8 rounded-md bg-red-500' : 'h-16 w-16 bg-white'}`} />
          </button>
        </div>
        {!error && (
          <button type="button" onClick={onFallback} className="mx-auto block text-xs font-semibold text-white/70 underline">
            Use the phone&rsquo;s camera app instead
          </button>
        )}
      </div>
    </div>
  )
}
