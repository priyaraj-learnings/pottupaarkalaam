'use client'

import { useMemo, useRef, useState, type ChangeEvent } from 'react'

import { CameraCapture, cameraAvailable } from '@/components/CameraCapture'
import { CategoryChips, SourceToggle } from '@/components/CategoryPicker'
import { LookGallery } from '@/components/LookGallery'
import { Button, Card, Notice, Sheet, useToast } from '@/components/ui'
import { api, ApiFailure, errorMessage } from '@/lib/client/api'
import { shrinkPhoto } from '@/lib/client/photos'
import { isFinished, type Account, type AppSettings, type LookView } from '@/lib/client/types'
import { useLookPolling } from '@/lib/client/useLookPolling'
import { canPair, categoryLabel, freeCreditsReturnDay, sourceFor, MAX_GARMENTS, MAX_GARMENTS_PAID, paidCreditsNeeded, planLooks, SOURCE_LABELS, type GarmentSource } from '@/lib/rules'

type Item = { id: string; blob: Blob; url: string; category: string; source: GarmentSource }
type Photo = { blob: Blob; url: string }

type CreateResponse = {
  looks: Array<{ id: string; kind: 'SINGLE' | 'PAIR'; credits: number }>
  account: Account
}

let nextItemId = 0

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

export default function TryOn({ account, settings, onAccount, onRecharge, onTermsNeeded, onVerifyMobile }: {
  account: Account
  settings: AppSettings
  onAccount: (account: Account) => void
  onRecharge: () => void
  onTermsNeeded: () => void
  // Opens the SMS code check, where mobile numbers can be verified.
  onVerifyMobile?: () => void
}) {
  const toast = useToast()
  const [category, setCategory] = useState<string | null>(null)
  const [source, setSource] = useState<GarmentSource>('FABRIC')
  const [items, setItems] = useState<Item[]>([])
  const [pairs, setPairs] = useState<Array<[string, string]>>([])
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [pairingFrom, setPairingFrom] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ message: string; recharge?: boolean } | null>(null)
  const [results, setResults] = useState<LookView[]>([])
  const [showResults, setShowResults] = useState(false)
  // What each look was made from, for "Try again".
  const [retryFrom, setRetryFrom] = useState<Record<string, { items: Item[]; paired: boolean }>>({})

  const clothesCamera = useRef<HTMLInputElement>(null)
  const clothesGallery = useRef<HTMLInputElement>(null)
  const selfieCamera = useRef<HTMLInputElement>(null)
  const selfieGallery = useRef<HTMLInputElement>(null)

  // Extra (4th and 5th) photos: for customers who recharged this month.
  const extraAllowed = settings.extraPhotos.enabled && account.paidThisMonth
  const extraCredits = settings.extraPhotos.credits
  const planOptions = useMemo(() => ({ maxGarments: extraAllowed ? MAX_GARMENTS_PAID : MAX_GARMENTS, extraCredits }), [extraAllowed, extraCredits])
  const [chosenLimit, setLimit] = useState(MAX_GARMENTS)
  const limit = extraAllowed ? Math.max(chosenLimit, items.length) : MAX_GARMENTS

  const indexOf = (id: string) => items.findIndex(item => item.id === id)
  const plan = useMemo(() => planLooks(
    items.map(item => ({ category: item.category, source: item.source })),
    pairs.map(([a, b]) => [items.findIndex(item => item.id === a), items.findIndex(item => item.id === b)] as [number, number]),
    planOptions,
  ), [items, pairs, planOptions])
  const available = account.freeLeft + account.credits
  const [freeCreditsBack] = useState(() => freeCreditsReturnDay(new Date()))
  const needed = plan.ok ? plan.credits : 0
  const short = plan.ok && (needed > available || paidCreditsNeeded(plan, account.freeLeft) > account.credits)
  const room = limit - items.length

  const partnerOf = (id: string) => {
    const pair = pairs.find(([a, b]) => a === id || b === id)
    return pair ? (pair[0] === id ? pair[1] : pair[0]) : null
  }
  const pairCandidates = (id: string) => {
    const item = items.find(candidate => candidate.id === id)
    if (!item) return []
    return items.filter(other => other.id !== id && !partnerOf(other.id) && canPair(item.category, other.category))
  }

  // ---------------------------------------------------------------------------
  // Photos
  // ---------------------------------------------------------------------------

  // The in-app camera (with timers) where the browser has one; otherwise the
  // phone's camera app through the hidden capture inputs.
  const [camera, setCamera] = useState<'clothes' | 'selfie' | null>(null)
  function openCamera(which: 'clothes' | 'selfie') {
    if (cameraAvailable()) setCamera(which)
    else (which === 'clothes' ? clothesCamera : selfieCamera).current?.click()
  }

  async function addClothes(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    await addClothesFiles(files)
  }

  async function addClothesFiles(files: File[]) {
    if (!files.length || !category) return
    if (files.length > room) toast(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (up to ${limit}).`)
    setPreparing(true)
    try {
      const added: Item[] = []
      for (const file of files.slice(0, room)) {
        const blob = await shrinkPhoto(file)
        added.push({ id: `item-${nextItemId++}`, blob, url: URL.createObjectURL(blob), category, source })
      }
      setItems(current => [...current, ...added].slice(0, limit))
    } catch (photoError) {
      toast(errorMessage(photoError), 'error')
    } finally {
      setPreparing(false)
    }
  }

  async function addSelfie(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await addSelfieFile(file)
  }

  async function addSelfieFile(file: File) {
    setPreparing(true)
    try {
      const blob = await shrinkPhoto(file, 2048, 0.9)
      if (photo) URL.revokeObjectURL(photo.url)
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    } catch (photoError) {
      toast(errorMessage(photoError), 'error')
    } finally {
      setPreparing(false)
    }
  }

  function removeItem(id: string) {
    const item = items.find(candidate => candidate.id === id)
    // Kept for "Try again" if a submitted look still uses it.
    const inUse = Object.values(retryFrom).some(entry => entry.items.some(used => used.id === id))
    if (item && !inUse) URL.revokeObjectURL(item.url)
    setItems(current => current.filter(candidate => candidate.id !== id))
    setPairs(current => current.filter(([a, b]) => a !== id && b !== id))
  }

  function changeItem(id: string, change: Partial<Pick<Item, 'category' | 'source'>>) {
    changeItems(item => item.id === id, () => change)
  }

  function changeItems(match: (item: Item) => boolean, change: (item: Item) => Partial<Pick<Item, 'category' | 'source'>>) {
    const next = items.map(item => (match(item) ? { ...item, ...change(item) } : item))
    setItems(next)
    // A pair that no longer makes sense is separated.
    setPairs(current => current.filter(([a, b]) => {
      const first = next.find(item => item.id === a)
      const second = next.find(item => item.id === b)
      return first && second && canPair(first.category, second.category)
    }))
  }

  // Step 1 describes the photos already added, so a change there changes them
  // too (back from the pictures, Saree -> Lehenga makes a lehenga next time).
  // Not when the new choice is worn with them as a pair (shirt, then veshti):
  // that is the next garment to add. "Undo" on the toast keeps them as they were.
  function chooseCategory(code: string) {
    const nextSource = sourceFor(code, source)
    setCategory(code)
    setSource(nextSource)
    if (!category || code === category) return
    relabel(item => item.category === category && !canPair(item.category, code), categoryLabel(code),
      item => ({ category: code, source: sourceFor(code, item.source) }))
  }

  function chooseSource(next: GarmentSource) {
    setSource(next)
    if (category && next !== source) {
      relabel(item => item.category === category && item.source === source, SOURCE_LABELS[next].toLowerCase(), () => ({ source: next }))
    }
  }

  // Changes the matching photos (what: the new choice, for the toast).
  function relabel(match: (item: Item) => boolean, what: string, change: (item: Item) => Partial<Pick<Item, 'category' | 'source'>>) {
    const changed = items.filter(match)
    if (!changed.length) return
    const before = new Map(changed.map(item => [item.id, { category: item.category, source: item.source }]))
    changeItems(item => before.has(item.id), change)
    const numbers = items.flatMap((item, index) => (before.has(item.id) ? [`#${index + 1}`] : []))
    toast(`${numbers.length === 1 ? 'Photo' : 'Photos'} ${numbers.join(', ')} changed to ${what}.`, 'info', {
      label: 'Undo',
      onClick: () => setItems(current => current.map(item => ({ ...item, ...before.get(item.id) }))),
    })
  }

  // ---------------------------------------------------------------------------
  // Try on
  // ---------------------------------------------------------------------------

  async function submit(chosen: Item[], chosenPairs: Array<[string, string]>, replaceLookId?: string) {
    if (!photo) return
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('photo', new File([photo.blob], 'photo.jpg', { type: 'image/jpeg' }))
      chosen.forEach((item, index) => form.append('garment', new File([item.blob], `garment-${index}.jpg`, { type: 'image/jpeg' })))
      form.append('garments', JSON.stringify(chosen.map(item => ({ category: item.category, source: item.source }))))
      const pairIndexes = chosenPairs.map(([a, b]) => [chosen.findIndex(item => item.id === a), chosen.findIndex(item => item.id === b)])
      form.append('pairs', JSON.stringify(pairIndexes))

      const local = planLooks(chosen.map(item => ({ category: item.category, source: item.source })), pairIndexes as Array<[number, number]>, planOptions)
      const created = await api<CreateResponse>('/api/try-ons', { method: 'POST', body: form })
      onAccount(created.account)

      const now = new Date().toISOString()
      const sources: Record<string, { items: Item[]; paired: boolean }> = {}
      const placeholders: LookView[] = created.looks.map((look, index) => {
        const planned = local.ok ? local.looks[index] : null
        const garments = planned?.garments ?? []
        sources[look.id] = { items: garments.map(garment => chosen[garment.index]), paired: look.kind === 'PAIR' }
        return {
          id: look.id, kind: look.kind, credits: look.credits, status: 'QUEUED',
          garments: garments.map(({ category, source: garmentSource, role }) => ({ category, source: garmentSource, role })),
          imageUrl: null, error: null, refunded: false, createdAt: now, expiresAt: now,
        }
      })
      setRetryFrom(current => ({ ...current, ...sources }))
      setResults(current => replaceLookId
        ? current.flatMap(look => (look.id === replaceLookId ? placeholders : [look]))
        : placeholders)
      setShowResults(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (submitError) {
      if (submitError instanceof ApiFailure && submitError.code === 'TERMS_REQUIRED') {
        onTermsNeeded()
        return
      }
      // The account changed (for example a new month): load it again.
      if (submitError instanceof ApiFailure && submitError.code === 'EXTRA_PHOTOS_NOT_ALLOWED') onTermsNeeded()
      const recharge = submitError instanceof ApiFailure && submitError.code === 'INSUFFICIENT_CREDITS'
      setError({ message: errorMessage(submitError), recharge })
      if (replaceLookId) toast(errorMessage(submitError), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function retry(look: LookView) {
    const from = retryFrom[look.id]
    if (!from) return
    const chosenPairs: Array<[string, string]> = from.paired ? [[from.items[0].id, from.items[1].id]] : []
    void submit(from.items, chosenPairs, look.id)
  }

  useLookPolling(results, setResults, onAccount)

  function tryMore() {
    setPairs([])
    setItems([])
    setShowResults(false)
    setError(null)
  }

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  if (showResults) {
    const making = results.some(look => !isFinished(look))
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black">Your pictures</h1>
          <p className="text-sm text-stone-600">
            {making ? 'Making them now. You can leave this screen; they will be in My pictures.' : 'Save the ones you like. Pictures are deleted after 3 days.'}
          </p>
        </div>
        <LookGallery looks={results} onRetry={look => (retryFrom[look.id] ? () => retry(look) : undefined)} />
        <div className="grid grid-cols-1 gap-2">
          <Button onClick={tryMore} className="w-full">Try other clothes</Button>
          <Button variant="secondary" onClick={() => { setShowResults(false); setError(null) }} className="w-full">Back to these clothes</Button>
        </div>
      </div>
    )
  }

  const editingItem = items.find(item => item.id === editing) ?? null
  const pairingItem = items.find(item => item.id === pairingFrom) ?? null

  return (
    <div className="space-y-4 pb-36">
      {!account.phoneVerified && (
        <Notice tone={available === 0 ? 'warning' : 'info'}>
          <b>{account.freeCreditsPerMonth} free credits every month need a verified mobile number</b> (one account per
          number).{' '}
          {onVerifyMobile
            ? <button type="button" onClick={onVerifyMobile} className="font-extrabold underline">Verify my number</button>
            : 'Mobile number checks are not available yet.'}
          {available === 0 && <>{' '}Or <button type="button" onClick={onRecharge} className="font-extrabold underline">recharge</button>.</>}
        </Notice>
      )}
      {account.phoneVerified && available === 0 && (
        <Notice tone="warning">
          <b>You have used this month&rsquo;s {account.freeCreditsPerMonth} free credits.</b> They come back on {freeCreditsBack}.
          To keep trying on now,{' '}
          <button type="button" onClick={onRecharge} className="font-extrabold underline">recharge</button>.
        </Notice>
      )}
      <Card title={<StepTitle number={1} done={Boolean(category)}>What are you trying?</StepTitle>}>
        <CategoryChips value={category} onChange={chooseCategory} />
        <div className="mt-4">
          <SourceToggle value={source} category={category} onChange={chooseSource} />
        </div>
      </Card>

      <Card title={<StepTitle number={2} done={items.length > 0}>Photos of the clothes <span className="font-semibold text-stone-500">({items.length}/{limit})</span></StepTitle>}>
        {extraAllowed ? (
          <div className="mb-3 space-y-1.5">
            <p className="text-sm font-bold text-stone-700">Photos in this try</p>
            <div role="radiogroup" aria-label="Photos in this try" className="grid grid-cols-3 gap-1 rounded-full bg-stone-100 p-1">
              {[MAX_GARMENTS, MAX_GARMENTS + 1, MAX_GARMENTS_PAID].map(count => (
                <button key={count} type="button" role="radio" aria-checked={limit === count} disabled={count < items.length}
                  onClick={() => setLimit(count)}
                  className={`min-h-9 rounded-full text-sm font-extrabold disabled:opacity-40 ${limit === count ? 'bg-white text-brand-800 shadow-sm ring-1 ring-brand-200' : 'text-stone-600'}`}>
                  {count}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-500">
              You recharged this month, so you can add up to {MAX_GARMENTS_PAID}. The 4th and 5th pictures cost {1 + extraCredits} credits
              each, from paid credits.
            </p>
          </div>
        ) : settings.extraPhotos.enabled ? (
          <p className="mb-3 text-xs text-stone-500">
            Up to {MAX_GARMENTS} photos a try.{' '}
            <button type="button" onClick={onRecharge} className="font-bold text-brand-700 underline">Recharge</button> this month to add up to {MAX_GARMENTS_PAID}.
          </p>
        ) : null}
        {!category && <p className="mb-3 text-sm text-stone-500">Choose what you are trying first.</p>}
        {category && room > 0 && (
          <p className="mb-3 text-sm text-stone-600">
            Adding: <b>{categoryLabel(category)}</b> · {SOURCE_LABELS[source].toLowerCase()}. Spread the cloth flat in good light.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!category || room <= 0 || preparing} onClick={() => openCamera('clothes')}>📷 Take photo</Button>
          <Button variant="secondary" disabled={!category || room <= 0 || preparing} onClick={() => clothesGallery.current?.click()}>🖼️ Gallery</Button>
        </div>
        <input ref={clothesCamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={addClothes} />
        <input ref={clothesGallery} type="file" accept="image/*" multiple className="hidden" onChange={addClothes} />

        {items.length > 0 && (
          <ul className="mt-4 grid grid-cols-2 gap-3">
            {items.map((item, index) => {
              const partner = partnerOf(item.id)
              const candidates = pairCandidates(item.id)
              return (
                <li key={item.id} className="overflow-hidden rounded-2xl ring-1 ring-stone-200">
                  <div className="relative aspect-[3/4] bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={`Clothes photo ${index + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black">{index + 1}</span>
                    <button type="button" onClick={() => removeItem(item.id)} aria-label={`Remove photo ${index + 1}`}
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">✕</button>
                  </div>
                  <div className="space-y-1 p-2">
                    <button type="button" onClick={() => setEditing(item.id)} className="block w-full text-left">
                      <span className="block truncate text-sm font-extrabold">{categoryLabel(item.category)} <span className="text-brand-600">✎</span></span>
                      <span className="block text-xs text-stone-500">{SOURCE_LABELS[item.source]}</span>
                    </button>
                    {partner ? (
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-xl bg-brand-50 px-2 py-1 text-xs font-bold text-brand-800">
                        <span>Pair with #{indexOf(partner) + 1}</span>
                        <button type="button" className="underline" onClick={() => setPairs(current => current.filter(([a, b]) => a !== item.id && b !== item.id))}>Separate</button>
                      </div>
                    ) : candidates.length > 0 ? (
                      <button type="button" onClick={() => setPairingFrom(item.id)} className="w-full rounded-xl border border-brand-200 px-2 py-1.5 text-xs font-bold text-brand-700">
                        👫 Wear with…
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title={<StepTitle number={3} done={Boolean(photo)}>Your photo</StepTitle>}>
        <p className="mb-3 text-sm text-stone-600">Any clear photo works: full length or from the waist up, facing the camera, in good light. Full length shows the whole outfit best.</p>
        <div className="flex gap-3">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt="Your photo" className="h-28 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-stone-200" />
          )}
          <div className="grid flex-1 grid-cols-1 gap-2">
            <Button disabled={preparing} onClick={() => openCamera('selfie')}>🤳 {photo ? 'Take again' : 'Take selfie'}</Button>
            <Button variant="secondary" disabled={preparing} onClick={() => selfieGallery.current?.click()}>🖼️ From gallery</Button>
          </div>
        </div>
        <input ref={selfieCamera} type="file" accept="image/*" capture="user" className="hidden" onChange={addSelfie} />
        <input ref={selfieGallery} type="file" accept="image/*" className="hidden" onChange={addSelfie} />
      </Card>

      {results.length > 0 && (
        <Button variant="ghost" onClick={() => setShowResults(true)} className="w-full">See the pictures you just made</Button>
      )}

      {/* Summary and the Try on button, above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3">
        <div className="mx-auto max-w-md space-y-2 rounded-3xl bg-white/95 p-3 shadow-xl ring-1 ring-stone-200 backdrop-blur">
          {error && (
            <Notice tone="error">
              {error.message}
              {error.recharge && <button type="button" onClick={onRecharge} className="ml-1 font-extrabold underline">Recharge</button>}
            </Notice>
          )}
          <div className="flex items-center justify-between gap-2 px-1 text-sm">
            <span className="font-semibold text-stone-700">
              {plan.ok
                ? `${plan.looks.length} picture${plan.looks.length === 1 ? '' : 's'} · ${needed} credit${needed === 1 ? '' : 's'}${plan.extraCredits ? ` (${plan.extraCredits} extra, paid)` : ''}`
                : 'Add clothes and your photo'}
            </span>
            <span className={`font-bold ${short ? 'text-red-700' : 'text-stone-500'}`}>You have {available}</span>
          </div>
          {short ? (
            <Button onClick={onRecharge} className="w-full">Recharge to try on</Button>
          ) : (
            <Button busy={submitting} disabled={!plan.ok || !photo || preparing} onClick={() => submit(items, pairs)} className="w-full text-base">
              ✨ Try on
            </Button>
          )}
        </div>
      </div>

      <CameraCapture open={camera === 'clothes'} title={category ? `Photo of the ${categoryLabel(category).toLowerCase()}` : 'Photo of the clothes'} facing="environment"
        onCapture={file => { setCamera(null); void addClothesFiles([file]) }} onClose={() => setCamera(null)}
        onFallback={() => { setCamera(null); clothesCamera.current?.click() }} />
      <CameraCapture open={camera === 'selfie'} title="Your photo" facing="user"
        onCapture={file => { setCamera(null); void addSelfieFile(file) }} onClose={() => setCamera(null)}
        onFallback={() => { setCamera(null); selfieCamera.current?.click() }} />

      <Sheet open={Boolean(pairingItem)} title="Wear together in one picture" onClose={() => setPairingFrom(null)}>
        {pairingItem && (
          <>
            <p className="mb-3 text-sm text-stone-600">
              Pick what to wear with the <b>{categoryLabel(pairingItem.category).toLowerCase()}</b>. A pair makes one picture and uses 2 credits.
            </p>
            <ul className="grid grid-cols-3 gap-2">
              {pairCandidates(pairingItem.id).map(candidate => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className="w-full overflow-hidden rounded-2xl text-left ring-1 ring-stone-200"
                    onClick={() => {
                      setPairs(current => [...current, [pairingItem.id, candidate.id]])
                      setPairingFrom(null)
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={candidate.url} alt="" className="aspect-[3/4] w-full object-cover" />
                    <span className="block truncate p-1.5 text-xs font-bold">#{indexOf(candidate.id) + 1} {categoryLabel(candidate.category)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>

      <Sheet open={Boolean(editingItem)} title="What is this photo?" onClose={() => setEditing(null)}>
        {editingItem && (
          <div className="space-y-4">
            <CategoryChips value={editingItem.category}
              onChange={code => changeItem(editingItem.id, { category: code, source: sourceFor(code, editingItem.source) })} />
            <SourceToggle value={editingItem.source} category={editingItem.category} onChange={value => changeItem(editingItem.id, { source: value })} />
            <Button onClick={() => setEditing(null)} className="w-full">Done</Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
