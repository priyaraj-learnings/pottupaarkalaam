'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { CategoryChips, SourceToggle } from '@/components/CategoryPicker'
import LookCard from '@/components/LookCard'
import { Button, Card, Notice, Sheet, useToast } from '@/components/ui'
import { api, ApiFailure, errorMessage } from '@/lib/client/api'
import { shrinkPhoto } from '@/lib/client/photos'
import { isFinished, type Account, type LookView } from '@/lib/client/types'
import { canPair, categoryLabel, freeCreditsReturnDay, MAX_GARMENTS, planLooks, SOURCE_LABELS, type GarmentSource } from '@/lib/rules'

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

export default function TryOn({ account, onAccount, onRecharge, onTermsNeeded }: {
  account: Account
  onAccount: (account: Account) => void
  onRecharge: () => void
  onTermsNeeded: () => void
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
  const [pollTick, setPollTick] = useState(0)
  // What each look was made from, for "Try again".
  const [retryFrom, setRetryFrom] = useState<Record<string, { items: Item[]; paired: boolean }>>({})

  const clothesCamera = useRef<HTMLInputElement>(null)
  const clothesGallery = useRef<HTMLInputElement>(null)
  const selfieCamera = useRef<HTMLInputElement>(null)
  const selfieGallery = useRef<HTMLInputElement>(null)

  const indexOf = (id: string) => items.findIndex(item => item.id === id)
  const plan = useMemo(() => planLooks(
    items.map(item => ({ category: item.category, source: item.source })),
    pairs.map(([a, b]) => [items.findIndex(item => item.id === a), items.findIndex(item => item.id === b)] as [number, number])
  ), [items, pairs])
  const available = account.freeLeft + account.credits
  const [freeCreditsBack] = useState(() => freeCreditsReturnDay(new Date()))
  const needed = plan.ok ? plan.credits : 0
  const room = MAX_GARMENTS - items.length

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

  async function addClothes(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length || !category) return
    if (files.length > room) toast(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (up to ${MAX_GARMENTS}).`)
    setPreparing(true)
    try {
      const added: Item[] = []
      for (const file of files.slice(0, room)) {
        const blob = await shrinkPhoto(file)
        added.push({ id: `item-${nextItemId++}`, blob, url: URL.createObjectURL(blob), category, source })
      }
      setItems(current => [...current, ...added].slice(0, MAX_GARMENTS))
    } catch (photoError) {
      toast(errorMessage(photoError), 'error')
    } finally {
      setPreparing(false)
    }
  }

  async function addSelfie(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
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
    const next = items.map(item => (item.id === id ? { ...item, ...change } : item))
    setItems(next)
    // A pair that no longer makes sense is separated.
    setPairs(current => current.filter(([a, b]) => {
      const first = next.find(item => item.id === a)
      const second = next.find(item => item.id === b)
      return first && second && canPair(first.category, second.category)
    }))
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

      const local = planLooks(chosen.map(item => ({ category: item.category, source: item.source })), pairIndexes as Array<[number, number]>)
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

  // Poll until every picture is made or has failed.
  const waitingIds = results.filter(look => !isFinished(look)).map(look => look.id).join(',')
  useEffect(() => {
    if (!waitingIds) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { looks } = await api<{ looks: LookView[] }>(`/api/try-ons?ids=${waitingIds}`)
        if (cancelled) return
        const byId = new Map(looks.map(look => [look.id, look]))
        setResults(current => current.map(look => byId.get(look.id) ?? look))
        if (looks.length && looks.every(isFinished)) {
          const me = await api<{ account: Account }>('/api/me')
          if (!cancelled) onAccount(me.account)
        }
      } catch {
        // Asked again on the next tick.
      } finally {
        if (!cancelled) setPollTick(tick => tick + 1)
      }
    }, 3000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [waitingIds, pollTick, onAccount])

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
        <div className="grid grid-cols-2 gap-3">
          {results.map(look => <LookCard key={look.id} look={look} onRetry={retryFrom[look.id] ? () => retry(look) : undefined} />)}
        </div>
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
      {available === 0 && (
        <Notice tone="warning">
          <b>You have used this month&rsquo;s {account.freeCreditsPerMonth} free credits.</b> They come back on {freeCreditsBack}.
          To keep trying on now,{' '}
          <button type="button" onClick={onRecharge} className="font-extrabold underline">recharge</button>.
        </Notice>
      )}
      <Card title={<StepTitle number={1} done={Boolean(category)}>What are you trying?</StepTitle>}>
        <CategoryChips value={category} onChange={setCategory} />
        <div className="mt-4">
          <SourceToggle value={source} onChange={setSource} />
        </div>
      </Card>

      <Card title={<StepTitle number={2} done={items.length > 0}>Photos of the clothes <span className="font-semibold text-stone-500">({items.length}/{MAX_GARMENTS})</span></StepTitle>}>
        {!category && <p className="mb-3 text-sm text-stone-500">Choose what you are trying first.</p>}
        {category && room > 0 && (
          <p className="mb-3 text-sm text-stone-600">
            Adding: <b>{categoryLabel(category)}</b> · {SOURCE_LABELS[source].toLowerCase()}. Spread the cloth flat in good light.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!category || room <= 0 || preparing} onClick={() => clothesCamera.current?.click()}>📷 Take photo</Button>
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
        <p className="mb-3 text-sm text-stone-600">Stand straight, full length (head to feet), in good light. Fitted clothes work best.</p>
        <div className="flex gap-3">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt="Your photo" className="h-28 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-stone-200" />
          )}
          <div className="grid flex-1 grid-cols-1 gap-2">
            <Button disabled={preparing} onClick={() => selfieCamera.current?.click()}>🤳 {photo ? 'Take again' : 'Take selfie'}</Button>
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
              {plan.ok ? `${plan.looks.length} picture${plan.looks.length === 1 ? '' : 's'} · ${needed} credit${needed === 1 ? '' : 's'}` : 'Add clothes and your photo'}
            </span>
            <span className={`font-bold ${needed > available ? 'text-red-700' : 'text-stone-500'}`}>You have {available}</span>
          </div>
          {needed > available ? (
            <Button onClick={onRecharge} className="w-full">Recharge to try on</Button>
          ) : (
            <Button busy={submitting} disabled={!plan.ok || !photo || preparing} onClick={() => submit(items, pairs)} className="w-full text-base">
              ✨ Try on
            </Button>
          )}
        </div>
      </div>

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
            <CategoryChips value={editingItem.category} onChange={code => changeItem(editingItem.id, { category: code })} />
            <SourceToggle value={editingItem.source} onChange={value => changeItem(editingItem.id, { source: value })} />
            <Button onClick={() => setEditing(null)} className="w-full">Done</Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
