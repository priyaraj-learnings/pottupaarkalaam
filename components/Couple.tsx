'use client'

import { useRef, useState, type ChangeEvent } from 'react'

import { CameraCapture, cameraAvailable, type Facing } from '@/components/CameraCapture'
import { CategoryChips, SourceToggle, type Group } from '@/components/CategoryPicker'
import LookCard from '@/components/LookCard'
import { Button, Card, formatInr, Notice, useToast } from '@/components/ui'
import { api, ApiFailure, errorMessage } from '@/lib/client/api'
import { shrinkPhoto } from '@/lib/client/photos'
import { isFinished, type Account, type AppSettings, type LookView } from '@/lib/client/types'
import { useLookPolling } from '@/lib/client/useLookPolling'
import { categoryLabel, type GarmentSource } from '@/lib/rules'

type Photo = { blob: Blob; url: string }
type Person = { category: string | null; source: GarmentSource; garment: Photo | null; photo: Photo | null }
type Side = 'his' | 'her'

type CreateResponse = {
  looks: Array<{ id: string; kind: 'COUPLE'; credits: number }>
  account: Account
}

const SIDES: Record<Side, { title: string; group: Group; him: string; his: string }> = {
  his: { title: 'Him', group: 'MEN', him: 'him', his: 'his' },
  her: { title: 'Her', group: 'WOMEN', him: 'her', his: 'her' },
}

const emptyPerson = (): Person => ({ category: null, source: 'FABRIC', garment: null, photo: null })
const ready = (person: Person) => Boolean(person.category && person.garment && person.photo)

function StepTitle({ number, children, done }: { number: number; children: React.ReactNode; done?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${done ? 'bg-emerald-500 text-white' : 'brand-gradient text-white'}`}>
        {done ? '✓' : number}
      </span>
      {children}
    </span>
  )
}

// A photo with "Take photo" and "Gallery" buttons.
function PhotoSlot({ label, help, photo, disabled, facing, onPick }: {
  label: string
  help: string
  photo: Photo | null
  disabled: boolean
  facing: Facing
  onPick: (file: File) => void
}) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onPick(file)
  }
  return (
    <div>
      <p className="text-sm font-bold text-stone-700">{label}</p>
      <p className="mb-2 text-xs text-stone-500">{help}</p>
      <div className="flex gap-3">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={label} className="h-28 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-stone-200" />
        )}
        <div className="grid flex-1 grid-cols-1 gap-2">
          <Button disabled={disabled} onClick={() => (cameraAvailable() ? setCameraOpen(true) : camera.current?.click())}>📷 {photo ? 'Take again' : 'Take photo'}</Button>
          <Button variant="secondary" disabled={disabled} onClick={() => gallery.current?.click()}>🖼️ Gallery</Button>
        </div>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={picked} />
      <CameraCapture open={cameraOpen} title={label} facing={facing}
        onCapture={file => { setCameraOpen(false); onPick(file) }} onClose={() => setCameraOpen(false)}
        onFallback={() => { setCameraOpen(false); camera.current?.click() }} />
    </div>
  )
}

// One picture of a couple, each in their own new clothes. Paid credits only.
export default function Couple({ account, settings, onAccount, onRecharge, onRefresh }: {
  account: Account
  settings: AppSettings
  onAccount: (account: Account) => void
  onRecharge: () => void
  // Reloads the account: the terms changed, or couple pictures were turned off.
  onRefresh: () => void
}) {
  const toast = useToast()
  const [people, setPeople] = useState<Record<Side, Person>>({ his: emptyPerson(), her: emptyPerson() })
  const [consent, setConsent] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ message: string; recharge?: boolean } | null>(null)
  const [results, setResults] = useState<LookView[]>([])
  const [showResults, setShowResults] = useState(false)
  // What each picture was made from, for "Try again".
  const [retryFrom, setRetryFrom] = useState<Record<string, Record<Side, Person>>>({})

  useLookPolling(results, setResults, onAccount)

  const needed = settings.couple.credits
  const short = account.credits < needed
  const allReady = ready(people.his) && ready(people.her)

  function update(side: Side, change: Partial<Person>) {
    setPeople(current => ({ ...current, [side]: { ...current[side], ...change } }))
  }

  async function pick(side: Side, key: 'garment' | 'photo', file: File) {
    setPreparing(true)
    try {
      const blob = key === 'photo' ? await shrinkPhoto(file, 2048, 0.9) : await shrinkPhoto(file)
      // Old photos stay in memory: "Try again" on an earlier picture may use them.
      update(side, { [key]: { blob, url: URL.createObjectURL(blob) } })
    } catch (photoError) {
      toast(errorMessage(photoError), 'error')
    } finally {
      setPreparing(false)
    }
  }

  async function submit(chosen: Record<Side, Person>, replaceLookId?: string) {
    if (!ready(chosen.his) || !ready(chosen.her)) return
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      const file = (photo: Photo | null, name: string) => new File([photo!.blob], name, { type: 'image/jpeg' })
      form.append('hisPhoto', file(chosen.his.photo, 'his-photo.jpg'))
      form.append('hisGarment', file(chosen.his.garment, 'his-garment.jpg'))
      form.append('herPhoto', file(chosen.her.photo, 'her-photo.jpg'))
      form.append('herGarment', file(chosen.her.garment, 'her-garment.jpg'))
      form.append('garments', JSON.stringify({
        his: { category: chosen.his.category, source: chosen.his.source },
        her: { category: chosen.her.category, source: chosen.her.source },
      }))
      form.append('consent', 'true')
      const created = await api<CreateResponse>('/api/couple', { method: 'POST', body: form })
      onAccount(created.account)

      const now = new Date().toISOString()
      const placeholders: LookView[] = created.looks.map(look => ({
        id: look.id, kind: 'COUPLE', credits: look.credits, status: 'QUEUED',
        garments: [
          { category: chosen.his.category!, source: chosen.his.source, role: 'HIS' },
          { category: chosen.her.category!, source: chosen.her.source, role: 'HER' },
        ],
        imageUrl: null, error: null, refunded: false, createdAt: now, expiresAt: now,
      }))
      setRetryFrom(current => ({ ...current, ...Object.fromEntries(placeholders.map(look => [look.id, chosen])) }))
      setResults(current => replaceLookId
        ? current.flatMap(look => (look.id === replaceLookId ? placeholders : [look]))
        : [...placeholders, ...current])
      setShowResults(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (submitError) {
      if (submitError instanceof ApiFailure && (submitError.code === 'TERMS_REQUIRED' || submitError.code === 'COUPLE_OFF')) {
        onRefresh()
        return
      }
      const recharge = submitError instanceof ApiFailure && submitError.code === 'INSUFFICIENT_CREDITS'
      setError({ message: errorMessage(submitError), recharge })
      if (replaceLookId) toast(errorMessage(submitError), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (showResults) {
    const making = results.some(look => !isFinished(look))
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black">Your couple pictures</h1>
          <p className="text-sm text-stone-600">
            {making ? 'Making it now. You can leave this screen; it will be in My pictures.' : 'Save the ones you like. Pictures are deleted after 3 days.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {results.map(look => <LookCard key={look.id} look={look} onRetry={retryFrom[look.id] ? () => void submit(retryFrom[look.id], look.id) : undefined} />)}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Button onClick={() => {
            setPeople(current => ({ his: { ...current.his, garment: null }, her: { ...current.her, garment: null } }))
            setShowResults(false)
            setError(null)
          }} className="w-full">Try other clothes</Button>
          <Button variant="secondary" onClick={() => { setShowResults(false); setError(null) }} className="w-full">Back to these photos</Button>
        </div>
      </div>
    )
  }

  const personCard = (side: Side, number: number) => {
    const person = people[side]
    const words = SIDES[side]
    return (
      <Card title={<StepTitle number={number} done={ready(person)}>{words.title}</StepTitle>}>
        <div className="space-y-4">
          <CategoryChips onlyGroup={words.group} value={person.category} onChange={category => update(side, { category })} />
          <SourceToggle value={person.source} onChange={source => update(side, { source })} />
          <PhotoSlot
            label={`${words.his[0].toUpperCase()}${words.his.slice(1)} clothes`}
            help={!person.category ? `Choose what ${words.him} is trying first.`
              : `${categoryLabel(person.category)}: ${person.source === 'FABRIC' ? 'spread the cloth flat' : 'the whole dress, on a hanger or laid flat'}, in good light.`}
            photo={person.garment}
            facing="environment"
            disabled={!person.category || preparing}
            onPick={file => void pick(side, 'garment', file)}
          />
          <PhotoSlot
            label={`Photo of ${words.him}`}
            help="Full length or from the waist up, facing the camera, in good light."
            photo={person.photo}
            facing="environment"
            disabled={preparing}
            onPick={file => void pick(side, 'photo', file)}
          />
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4 pb-40">
      <div>
        <h1 className="text-2xl font-black">Couple picture</h1>
        <p className="text-sm text-stone-600">One picture of the two of you, each in your own new clothes.</p>
      </div>
      <Notice tone={short ? 'warning' : 'info'}>
        A couple picture uses <b>{needed} paid credits</b> ({formatInr(needed * settings.pricing.standardRateInr)} at {formatInr(settings.pricing.standardRateInr)} a
        credit). Free credits can&rsquo;t be used for it. If the picture fails, the credits come back.
        {short && <> You have {account.credits} paid credit{account.credits === 1 ? '' : 's'}: <button type="button" onClick={onRecharge} className="font-extrabold underline">recharge</button>.</>}
      </Notice>

      {personCard('his', 1)}
      {personCard('her', 2)}

      <Card title={<StepTitle number={3} done={consent}>Both of you agree</StepTitle>}>
        <label className="flex items-start gap-3 text-sm text-stone-700">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
          <span>Both of us are 18 or older and agree to our photos being used to make this picture.</span>
        </label>
      </Card>

      {results.length > 0 && (
        <Button variant="ghost" onClick={() => setShowResults(true)} className="w-full">See the couple pictures you just made</Button>
      )}

      {/* Summary and the button, above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3">
        <div className="mx-auto max-w-md space-y-2 rounded-3xl bg-white/95 p-3 shadow-xl ring-1 ring-stone-200 backdrop-blur">
          {error && (
            <Notice tone="error">
              {error.message}
              {error.recharge && <button type="button" onClick={onRecharge} className="ml-1 font-extrabold underline">Recharge</button>}
            </Notice>
          )}
          <div className="flex items-center justify-between gap-2 px-1 text-sm">
            <span className="font-semibold text-stone-700">{allReady ? `1 couple picture · ${needed} credits` : 'Add both garments and photos'}</span>
            <span className={`font-bold ${short ? 'text-red-700' : 'text-stone-500'}`}>Paid credits: {account.credits}</span>
          </div>
          {short ? (
            <Button onClick={onRecharge} className="w-full">Recharge for a couple picture</Button>
          ) : (
            <Button busy={submitting} disabled={!allReady || !consent || preparing} onClick={() => submit(people)} className="w-full text-base">
              💑 Make couple picture
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
