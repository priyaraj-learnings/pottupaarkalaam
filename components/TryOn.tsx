'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { CameraCapture, cameraAvailable } from '@/components/CameraCapture'
import { CategoryChips, SourceToggle } from '@/components/CategoryPicker'
import { InstallAfterPicture } from '@/components/InstallApp'
import { LookGallery } from '@/components/LookGallery'
import { ReadyAlert } from '@/components/ReadyAlert'
import { Button, Card, Notice, Sheet, useToast } from '@/components/ui'
import { api, ApiFailure, errorMessage } from '@/lib/client/api'
import { shrinkPhoto } from '@/lib/client/photos'
import { isFinished, type Account, type AppSettings, type LookView } from '@/lib/client/types'
import { useLookPolling } from '@/lib/client/useLookPolling'
import { useLanguage, useT } from '@/lib/client/language'
import { useCategoryName, useSourceName } from '@/lib/client/categoryNames'
import { SampleModelPicker, type SampleModel } from '@/components/SampleModels'
import { BackgroundPicker } from '@/components/BackgroundPicker'
import { ReviewPrompt } from '@/components/Growth'
import { checkPersonPhoto, problemText, type PhotoProblem } from '@/lib/client/photoCheck'
import { clearDraft, loadDraft, saveDraft } from '@/lib/client/tryOnDraft'
import { countTryOnStart } from '@/lib/client/visits'
import { canPair, freeCreditsReturnDay, sourceFor, MAX_GARMENTS, MAX_GARMENTS_PAID, paidCreditsNeeded, planLooks, type GarmentSource } from '@/lib/rules'

type Item = { id: string; blob: Blob; url: string; category: string; source: GarmentSource }
type Photo = { blob: Blob; url: string }

type CreateResponse = {
  looks: Array<{ id: string; kind: 'SINGLE' | 'PAIR'; credits: number }>
  account: Account
}

let nextItemId = 0

// Before signing in (guest): no credits yet, no extra photos.
const GUEST_ACCOUNT: Account = {
  credits: 0, freeCreditsPerMonth: 0, freeLeft: 0, termsVersion: null, termsAcceptedAt: null, phone: null,
  phoneVerified: true, offersOk: false, phoneAskedAt: null, coupleOptIn: false, paidThisMonth: false,
  emailOffersOk: false, monthlyEmailOk: false, referralCode: '', referralCredits: 0, friendsJoined: 0, starterAvailable: false, completedPictures: 0,
}
const GUEST_EXTRA_PHOTOS = { enabled: false, credits: 1 }

export type GuestTryOn = {
  // Free pictures a month (from the public sign-in options), for the offer line.
  freeCreditsPerMonth: number | null
  // "Try on" with everything ready: the draft is saved; open sign-in.
  onSignIn: () => void
}

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

// guest: a visitor who has not signed in; account and settings are null.
export default function TryOn({ account: signedInAccount, settings, onAccount, onRecharge, onTermsNeeded, onVerifyMobile, guest }: {
  account: Account | null
  settings: AppSettings | null
  onAccount: (account: Account) => void
  onRecharge: () => void
  onTermsNeeded: () => void
  // Opens the SMS code check, where mobile numbers can be verified.
  onVerifyMobile?: () => void
  guest?: GuestTryOn
}) {
  const toast = useToast()
  const t = useT()
  const ta = useLanguage() === 'ta'
  const name = useCategoryName()
  const sourceName = useSourceName()
  const account = signedInAccount ?? GUEST_ACCOUNT
  const extraPhotos = settings?.extraPhotos ?? GUEST_EXTRA_PHOTOS
  const [category, setCategory] = useState<string | null>(null)
  const [source, setSource] = useState<GarmentSource>('FABRIC')
  const [items, setItems] = useState<Item[]>([])
  const [pairs, setPairs] = useState<Array<[string, string]>>([])
  const [photo, setPhoto] = useState<Photo | null>(null)
  // What the quick photo check found (only a warning).
  const [photoProblems, setPhotoProblems] = useState<PhotoProblem[]>([])
  // A sample model chosen instead of the customer's own photo.
  const [modelId, setModelId] = useState<string | null>(null)
  // An occasion background ('' keeps the photo's own).
  const [background, setBackground] = useState('')
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
  const extraAllowed = extraPhotos.enabled && account.paidThisMonth
  const extraCredits = extraPhotos.credits
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
  const [freeCreditsBackEn] = useState(() => freeCreditsReturnDay(new Date()))
  // The same day written in Tamil (lib/rules.ts gives it in English).
  const [freeCreditsBackTa] = useState(() => {
    const india = new Date(Date.now() + 5.5 * 3_600_000)
    const next = new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth() + 1, 1))
    return next.toLocaleDateString('ta-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  })
  const freeCreditsBack = ta ? freeCreditsBackTa : freeCreditsBackEn
  // What is still missing before "Try on" can start, in plain words.
  const clothesWord = source === 'STITCHED' ? 'dress' : 'fabric'
  const clothesWordTa = source === 'STITCHED' ? 'உடை' : 'துணி'
  const missing = !items.length && !photo ? t(`Upload a ${clothesWord} photo and a selfie (your photo) to try on.`,
    `அணிந்து பார்க்க ${clothesWordTa} புகைப்படமும் செல்ஃபியும் (உங்கள் புகைப்படம்) பதிவேற்றுங்கள்.`)
    : !items.length ? t(`Upload a ${clothesWord} photo to try on.`, `அணிந்து பார்க்க ${clothesWordTa} புகைப்படத்தைப் பதிவேற்றுங்கள்.`)
      : !photo ? t('Upload a selfie or your photo to try on.', 'அணிந்து பார்க்க செல்ஃபி அல்லது உங்கள் புகைப்படத்தைப் பதிவேற்றுங்கள்.')
        : null
  // "Try on" was tapped with something missing: say what, until it is added.
  const [showMissing, setShowMissing] = useState(false)
  const needed = plan.ok ? plan.credits : 0
  const short = !guest && plan.ok && (needed > available || paidCreditsNeeded(plan, account.freeLeft) > account.credits)
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
    if (files.length > room) toast(t(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (up to ${limit}).`, `இன்னும் ${room} புகைப்படம் மட்டுமே சேர்க்க முடியும் (அதிகபட்சம் ${limit}).`))
    setPreparing(true)
    try {
      const added: Item[] = []
      for (const file of files.slice(0, room)) {
        const blob = await shrinkPhoto(file)
        added.push({ id: `item-${nextItemId++}`, blob, url: URL.createObjectURL(blob), category, source })
      }
      setItems(current => [...current, ...added].slice(0, limit))
      countTryOnStart()
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
      setModelId(null)
      setPhotoProblems(await checkPersonPhoto(blob))
      countTryOnStart()
    } catch (photoError) {
      toast(errorMessage(photoError), 'error')
    } finally {
      setPreparing(false)
    }
  }

  async function pickModel(model: SampleModel) {
    setPreparing(true)
    try {
      const response = await fetch(model.url)
      if (!response.ok) throw new Error(t('This model photo could not be loaded. Please try another.', 'இந்த மாடல் புகைப்படம் வரவில்லை. வேறொன்றைத் தேர்ந்தெடுங்கள்.'))
      const blob = await response.blob()
      if (photo) URL.revokeObjectURL(photo.url)
      setPhoto({ blob, url: URL.createObjectURL(blob) })
      setModelId(model.id)
      setPhotoProblems([])
      countTryOnStart()
    } catch (modelError) {
      toast(errorMessage(modelError), 'error')
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
    relabel(item => item.category === category && !canPair(item.category, code), name(code),
      item => ({ category: code, source: sourceFor(code, item.source) }))
  }

  function chooseSource(next: GarmentSource) {
    setSource(next)
    if (category && next !== source) {
      relabel(item => item.category === category && item.source === source, sourceName(next).toLowerCase(), () => ({ source: next }))
    }
  }

  // Changes the matching photos (what: the new choice, for the toast).
  function relabel(match: (item: Item) => boolean, what: string, change: (item: Item) => Partial<Pick<Item, 'category' | 'source'>>) {
    const changed = items.filter(match)
    if (!changed.length) return
    const before = new Map(changed.map(item => [item.id, { category: item.category, source: item.source }]))
    changeItems(item => before.has(item.id), change)
    const numbers = items.flatMap((item, index) => (before.has(item.id) ? [`#${index + 1}`] : []))
    toast(t(`${numbers.length === 1 ? 'Photo' : 'Photos'} ${numbers.join(', ')} changed to ${what}.`,
      `புகைப்படம் ${numbers.join(', ')} இப்போது ${what} ஆக மாற்றப்பட்டது.`), 'info', {
      label: t('Undo', 'பழையபடி'),
      onClick: () => setItems(current => current.map(item => ({ ...item, ...before.get(item.id) }))),
    })
  }

  // ---------------------------------------------------------------------------
  // Try on
  // ---------------------------------------------------------------------------

  // usePhoto: the customer's photo when it is not in state yet (a resumed draft).
  async function submit(chosen: Item[], chosenPairs: Array<[string, string]>, replaceLookId?: string, usePhoto?: Photo, useBackground = background) {
    const photo_ = usePhoto ?? photo
    if (!photo_) return
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('photo', new File([photo_.blob], 'photo.jpg', { type: 'image/jpeg' }))
      chosen.forEach((item, index) => form.append('garment', new File([item.blob], `garment-${index}.jpg`, { type: 'image/jpeg' })))
      form.append('garments', JSON.stringify(chosen.map(item => ({ category: item.category, source: item.source }))))
      const pairIndexes = chosenPairs.map(([a, b]) => [chosen.findIndex(item => item.id === a), chosen.findIndex(item => item.id === b)])
      form.append('pairs', JSON.stringify(pairIndexes))
      if (useBackground) form.append('background', useBackground)

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

  // Never starts without clothes and the customer's photo: says what is missing
  // and scrolls to that step instead.
  function tryOn() {
    if (missing) {
      setShowMissing(true)
      document.getElementById(items.length ? 'tryon-photo' : 'tryon-clothes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (!plan.ok) {
      setError({ message: plan.message })
      return
    }
    setShowMissing(false)
    if (guest) {
      void startSignIn()
      return
    }
    void submit(items, pairs)
  }

  // Before signing in: keep the choices and photos on this phone, then sign in.
  async function startSignIn() {
    if (!photo || !guest) return
    await saveDraft({
      category, source, photo: photo.blob, background,
      items: items.map(item => ({ blob: item.blob, category: item.category, source: item.source })),
      pairs: pairs.map(([a, b]) => [indexOf(a), indexOf(b)] as [number, number]),
    }).catch(() => undefined)
    guest.onSignIn()
  }

  // Signed in after starting as a guest: take the photos back and make the
  // picture at once (once; the draft is removed).
  const resumed = useRef(false)
  useEffect(() => {
    // A ref, not a cancel flag: React runs effects twice in development.
    if (guest || resumed.current) return
    resumed.current = true
    void loadDraft().then(async draft => {
      if (!draft) return
      await clearDraft()
      const restored: Item[] = draft.items.map(item => ({ id: `item-${nextItemId++}`, blob: item.blob, url: URL.createObjectURL(item.blob), category: item.category, source: item.source }))
      const restoredPairs = draft.pairs
        .filter(([a, b]) => restored[a] && restored[b])
        .map(([a, b]) => [restored[a].id, restored[b].id] as [string, string])
      const restoredPhoto = { blob: draft.photo, url: URL.createObjectURL(draft.photo) }
      setCategory(draft.category)
      setSource(draft.source)
      setItems(restored)
      setPairs(restoredPairs)
      setPhoto(restoredPhoto)
      setBackground(draft.background ?? '')
      toast(t('Making your picture now.', 'உங்கள் படம் இப்போது தயாராகிறது.'))
      await submit(restored, restoredPairs, undefined, restoredPhoto, draft.background ?? '')
    })
    // Once, when the signed-in try-on screen first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          <h1 className="text-2xl font-black">{t('Your pictures', 'உங்கள் படங்கள்')}</h1>
          <p className="text-sm text-stone-600">
            {making
              ? t('Making them now. You can leave this screen; they will be in My pictures.', 'இப்போது தயாராகின்றன. இந்தத் திரையை விட்டுச் செல்லலாம்; அவை என் படங்கள் பகுதியில் இருக்கும்.')
              : t('Save the ones you like. Pictures are deleted after 3 days.', 'பிடித்தவற்றைச் சேமியுங்கள். படங்கள் 3 நாட்களுக்குப் பிறகு நீக்கப்படும்.')}
          </p>
        </div>
        <ReadyAlert making={making} />
        <LookGallery looks={results} onRetry={look => (retryFrom[look.id] ? () => retry(look) : undefined)} />
        {results.some(look => look.status === 'COMPLETED' && look.imageUrl) && <InstallAfterPicture />}
        {!making && <ReviewPrompt account={account} reviewUrl={settings?.googleReviewUrl ?? null} />}
        <div className="grid grid-cols-1 gap-2">
          <Button onClick={tryMore} className="w-full">{t('Try other clothes', 'வேறு உடைகளை அணிந்து பார்')}</Button>
          <Button variant="secondary" onClick={() => { setShowResults(false); setError(null) }} className="w-full">{t('Back to these clothes', 'இந்த உடைகளுக்குத் திரும்பு')}</Button>
        </div>
      </div>
    )
  }

  const editingItem = items.find(item => item.id === editing) ?? null
  const pairingItem = items.find(item => item.id === pairingFrom) ?? null

  return (
    <div className="space-y-4 pb-36">
      {!guest && !account.phoneVerified && (
        <Notice tone={available === 0 ? 'warning' : 'info'}>
          <b>{t(`${account.freeCreditsPerMonth} free credits every month need a verified mobile number`,
            `மாதந்தோறும் ${account.freeCreditsPerMonth} இலவச கிரெடிட்கள் பெற, சரிபார்த்த மொபைல் எண் தேவை`)}</b>{' '}
          {t('(one account per number).', '(ஒரு எண்ணுக்கு ஒரு கணக்கு மட்டும்).')}{' '}
          {onVerifyMobile
            ? <button type="button" onClick={onVerifyMobile} className="font-extrabold underline">{t('Verify my number', 'என் எண்ணைச் சரிபார்')}</button>
            : t('Mobile number checks are not available yet.', 'மொபைல் எண் சரிபார்ப்பு இன்னும் வரவில்லை.')}
          {available === 0 && (ta
            ? <>{' '}அல்லது <button type="button" onClick={onRecharge} className="font-extrabold underline">ரீசார்ஜ்</button> செய்யுங்கள்.</>
            : <>{' '}Or <button type="button" onClick={onRecharge} className="font-extrabold underline">recharge</button>.</>)}
        </Notice>
      )}
      {!guest && account.phoneVerified && available === 0 && (
        <Notice tone="warning">
          {ta ? (
            <>
              <b>இந்த மாதத்தின் {account.freeCreditsPerMonth} இலவச கிரெடிட்களையும் பயன்படுத்திவிட்டீர்கள்.</b> அவை {freeCreditsBack} அன்று மீண்டும் கிடைக்கும்.
              இப்போதே தொடர்ந்து அணிந்து பார்க்க,{' '}
              <button type="button" onClick={onRecharge} className="font-extrabold underline">ரீசார்ஜ்</button> செய்யுங்கள்.
            </>
          ) : (
            <>
              <b>You have used this month&rsquo;s {account.freeCreditsPerMonth} free credits.</b> They come back on {freeCreditsBack}.
              To keep trying on now,{' '}
              <button type="button" onClick={onRecharge} className="font-extrabold underline">recharge</button>.
            </>
          )}
        </Notice>
      )}
      <Card title={<StepTitle number={1} done={Boolean(category)}>{t('What are you trying?', 'எதை அணிந்து பார்க்கிறீர்கள்?')}</StepTitle>}>
        <CategoryChips value={category} onChange={chooseCategory} />
        <div className="mt-4">
          <SourceToggle value={source} category={category} onChange={chooseSource} />
        </div>
      </Card>

      <Card id="tryon-clothes" title={<StepTitle number={2} done={items.length > 0}>{t('Photos of the clothes', 'உடைகளின் புகைப்படங்கள்')} <span className="font-semibold text-stone-500">({items.length}/{limit})</span></StepTitle>}>
        {extraAllowed ? (
          <div className="mb-3 space-y-1.5">
            <p className="text-sm font-bold text-stone-700">{t('Photos in this try', 'இந்த முறை எத்தனை புகைப்படங்கள்')}</p>
            <div role="radiogroup" aria-label={t('Photos in this try', 'இந்த முறை எத்தனை புகைப்படங்கள்')} className="grid grid-cols-3 gap-1 rounded-full bg-stone-100 p-1">
              {[MAX_GARMENTS, MAX_GARMENTS + 1, MAX_GARMENTS_PAID].map(count => (
                <button key={count} type="button" role="radio" aria-checked={limit === count} disabled={count < items.length}
                  onClick={() => setLimit(count)}
                  className={`min-h-9 rounded-full text-sm font-extrabold disabled:opacity-40 ${limit === count ? 'bg-white text-brand-800 shadow-sm ring-1 ring-brand-200' : 'text-stone-600'}`}>
                  {count}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-500">
              {t(`You recharged this month, so you can add up to ${MAX_GARMENTS_PAID}. The 4th and 5th pictures cost ${1 + extraCredits} credits each, from paid credits.`,
                `இந்த மாதம் ரீசார்ஜ் செய்திருப்பதால் ${MAX_GARMENTS_PAID} வரை சேர்க்கலாம். 4வது, 5வது படங்களுக்கு ஒவ்வொன்றுக்கும் ${1 + extraCredits} கிரெடிட்கள், பணம் செலுத்திய கிரெடிட்களிலிருந்து.`)}
            </p>
          </div>
        ) : extraPhotos.enabled ? (
          <p className="mb-3 text-xs text-stone-500">
            {ta ? (
              <>
                ஒரு முறைக்கு {MAX_GARMENTS} புகைப்படங்கள் வரை. இந்த மாதம்{' '}
                <button type="button" onClick={onRecharge} className="font-bold text-brand-700 underline">ரீசார்ஜ்</button> செய்தால் {MAX_GARMENTS_PAID} வரை சேர்க்கலாம்.
              </>
            ) : (
              <>
                Up to {MAX_GARMENTS} photos a try.{' '}
                <button type="button" onClick={onRecharge} className="font-bold text-brand-700 underline">Recharge</button> this month to add up to {MAX_GARMENTS_PAID}.
              </>
            )}
          </p>
        ) : null}
        {!category && <p className="mb-3 text-sm text-stone-500">{t('Choose what you are trying first.', 'முதலில் எதை அணிந்து பார்க்கிறீர்கள் என்று தேர்ந்தெடுங்கள்.')}</p>}
        {category && room > 0 && (
          <p className="mb-3 text-sm text-stone-600">
            {t('Adding:', 'சேர்ப்பது:')} <b>{name(category)}</b> · {sourceName(source).toLowerCase()}. {t('Spread the cloth flat in good light.', 'நல்ல வெளிச்சத்தில் துணியைச் சமமாக விரித்து வையுங்கள்.')}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!category || room <= 0 || preparing} onClick={() => openCamera('clothes')}>📷 {t('Take photo', 'புகைப்படம் எடு')}</Button>
          <Button variant="secondary" disabled={!category || room <= 0 || preparing} onClick={() => clothesGallery.current?.click()}>🖼️ {t('Gallery', 'கேலரி')}</Button>
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
                    <img src={item.url} alt={t(`Clothes photo ${index + 1}`, `உடை புகைப்படம் ${index + 1}`)} className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black">{index + 1}</span>
                    <button type="button" onClick={() => removeItem(item.id)} aria-label={t(`Remove photo ${index + 1}`, `புகைப்படம் ${index + 1}-ஐ நீக்கு`)}
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">✕</button>
                  </div>
                  <div className="space-y-1 p-2">
                    <button type="button" onClick={() => setEditing(item.id)} className="block w-full text-left">
                      <span className="block truncate text-sm font-extrabold">{name(item.category)} <span className="text-brand-600">✎</span></span>
                      <span className="block text-xs text-stone-500">{sourceName(item.source)}</span>
                    </button>
                    {partner ? (
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-xl bg-brand-50 px-2 py-1 text-xs font-bold text-brand-800">
                        <span>{t(`Pair with #${indexOf(partner) + 1}`, `#${indexOf(partner) + 1} உடன் இணை`)}</span>
                        <button type="button" className="underline" onClick={() => setPairs(current => current.filter(([a, b]) => a !== item.id && b !== item.id))}>{t('Separate', 'பிரி')}</button>
                      </div>
                    ) : candidates.length > 0 ? (
                      <button type="button" onClick={() => setPairingFrom(item.id)} className="w-full rounded-xl border border-brand-200 px-2 py-1.5 text-xs font-bold text-brand-700">
                        👫 {t('Wear with…', 'இதனுடன் அணி…')}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card id="tryon-photo" title={<StepTitle number={3} done={Boolean(photo)}>{t('Your photo', 'உங்கள் புகைப்படம்')}</StepTitle>}>
        <p className="mb-3 text-sm text-stone-600">{t('Any clear photo works: full length or from the waist up, facing the camera, in good light. Full length shows the whole outfit best.',
          'தெளிவான எந்தப் புகைப்படமும் போதும்: முழு உயரம் அல்லது இடுப்பு வரை, கேமராவைப் பார்த்தபடி, நல்ல வெளிச்சத்தில். முழு உயரப் புகைப்படத்தில் முழு உடையும் நன்றாகத் தெரியும்.')}</p>
        <div className="flex gap-3">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt={t('Your photo', 'உங்கள் புகைப்படம்')} className="h-28 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-stone-200" />
          )}
          <div className="grid flex-1 grid-cols-1 gap-2">
            <Button disabled={preparing} onClick={() => openCamera('selfie')}>🤳 {photo ? t('Take again', 'மீண்டும் எடு') : t('Take selfie', 'செல்ஃபி எடு')}</Button>
            <Button variant="secondary" disabled={preparing} onClick={() => selfieGallery.current?.click()}>🖼️ {t('From gallery', 'கேலரியிலிருந்து')}</Button>
          </div>
        </div>
        {photo && photoProblems.length > 0 && (
          <div className="mt-3"><Notice tone="warning">
            <p className="font-bold">{t('Check your photo before trying on:', 'முயற்சிக்கும் முன் உங்கள் புகைப்படத்தைச் சரிபாருங்கள்:')}</p>
            <ul className="mt-1 list-disc pl-5">{photoProblems.map(problem => <li key={problem}>{problemText(problem, t)}</li>)}</ul>
            <p className="mt-1 text-xs">{t('You can still use it, but a clearer photo gives a better picture.', 'இதையே பயன்படுத்தலாம்; ஆனால் தெளிவான புகைப்படம் சிறந்த படத்தைத் தரும்.')}</p>
          </Notice></div>
        )}
        <SampleModelPicker chosen={modelId} onPick={model => void pickModel(model)} disabled={preparing} />
        <div className="mt-3 border-t border-stone-100 pt-3">
          <BackgroundPicker value={background} onChange={setBackground} />
        </div>
        <input ref={selfieCamera} type="file" accept="image/*" capture="user" className="hidden" onChange={addSelfie} />
        <input ref={selfieGallery} type="file" accept="image/*" className="hidden" onChange={addSelfie} />
      </Card>

      {results.length > 0 && (
        <Button variant="ghost" onClick={() => setShowResults(true)} className="w-full">{t('See the pictures you just made', 'இப்போது செய்த படங்களைப் பார்')}</Button>
      )}

      {/* Summary and the Try on button, above the tab bar. */}
      <div className={`fixed inset-x-0 z-30 px-3 ${guest ? 'bottom-[calc(0.75rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(4.25rem+env(safe-area-inset-bottom))]'}`}>
        <div className="mx-auto max-w-md space-y-2 rounded-3xl bg-white/95 p-3 shadow-xl ring-1 ring-stone-200 backdrop-blur">
          {showMissing && missing && <Notice tone="error">{missing}</Notice>}
          {error && (
            <Notice tone="error">
              {error.message}
              {error.recharge && <button type="button" onClick={onRecharge} className="ml-1 font-extrabold underline">{t('Recharge', 'ரீசார்ஜ்')}</button>}
            </Notice>
          )}
          <div className="flex items-center justify-between gap-2 px-1 text-sm">
            <span className="font-semibold text-stone-700">
              {plan.ok
                ? t(`${plan.looks.length} picture${plan.looks.length === 1 ? '' : 's'}${guest ? '' : ` · ${needed} credit${needed === 1 ? '' : 's'}`}${plan.extraCredits ? ` (${plan.extraCredits} extra, paid)` : ''}`,
                  `${plan.looks.length} ${plan.looks.length === 1 ? 'படம்' : 'படங்கள்'}${guest ? '' : ` · ${needed} ${needed === 1 ? 'கிரெடிட்' : 'கிரெடிட்கள்'}`}${plan.extraCredits ? ` (${plan.extraCredits} கூடுதல், கட்டணம்)` : ''}`)
                : missing ? t('Add clothes and your photo', 'உடைகளையும் உங்கள் புகைப்படத்தையும் சேருங்கள்') : plan.message}
            </span>
            {guest
              ? <span className="font-bold text-emerald-700">{guest.freeCreditsPerMonth ? t(`${guest.freeCreditsPerMonth} free a month`, `மாதம் ${guest.freeCreditsPerMonth} இலவசம்`) : t('Free to start', 'தொடங்க இலவசம்')}</span>
              : <span className={`font-bold ${short ? 'text-red-700' : 'text-stone-500'}`}>{t(`You have ${available}`, `உங்களிடம் ${available}`)}</span>}
          </div>
          {short ? (
            <>
              <Button onClick={onRecharge} className="w-full">{t('Recharge to try on', 'அணிந்து பார்க்க ரீசார்ஜ் செய்')}</Button>
              {account.starterAvailable && settings?.starterPack && (
                <p className="text-center text-xs font-bold text-emerald-700">
                  🎉 {t(`Starter pack: ${settings.starterPack.credits} credits for ₹${settings.starterPack.amountInr} (first recharge)`,
                    `தொடக்கச் சலுகை: ₹${settings.starterPack.amountInr}-க்கு ${settings.starterPack.credits} கிரெடிட்கள் (முதல் ரீசார்ஜ் மட்டும்)`)}
                </p>
              )}
            </>
          ) : (
            <Button busy={submitting} disabled={preparing} onClick={tryOn} className="w-full text-base">
              ✨ {t('Try on', 'அணிந்து பார்')}
            </Button>
          )}
        </div>
      </div>

      <CameraCapture open={camera === 'clothes'} title={category ? t(`Photo of the ${name(category).toLowerCase()}`, `${name(category)} புகைப்படம்`) : t('Photo of the clothes', 'உடையின் புகைப்படம்')} facing="environment"
        onCapture={file => { setCamera(null); void addClothesFiles([file]) }} onClose={() => setCamera(null)}
        onFallback={() => { setCamera(null); clothesCamera.current?.click() }} />
      <CameraCapture open={camera === 'selfie'} title={t('Your photo', 'உங்கள் புகைப்படம்')} facing="user"
        onCapture={file => { setCamera(null); void addSelfieFile(file) }} onClose={() => setCamera(null)}
        onFallback={() => { setCamera(null); selfieCamera.current?.click() }} />

      <Sheet open={Boolean(pairingItem)} title={t('Wear together in one picture', 'ஒரே படத்தில் சேர்த்து அணி')} onClose={() => setPairingFrom(null)}>
        {pairingItem && (
          <>
            <p className="mb-3 text-sm text-stone-600">
              {ta ? (
                <><b>{name(pairingItem.category)}</b> உடன் எதை அணிவது என்று தேர்ந்தெடுங்கள். ஒரு இணை ஒரே படம் தரும், 2 கிரெடிட்கள் ஆகும்.</>
              ) : (
                <>Pick what to wear with the <b>{name(pairingItem.category).toLowerCase()}</b>. A pair makes one picture and uses 2 credits.</>
              )}
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
                    <span className="block truncate p-1.5 text-xs font-bold">#{indexOf(candidate.id) + 1} {name(candidate.category)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>

      <Sheet open={Boolean(editingItem)} title={t('What is this photo?', 'இது என்ன புகைப்படம்?')} onClose={() => setEditing(null)}>
        {editingItem && (
          <div className="space-y-4">
            <CategoryChips value={editingItem.category}
              onChange={code => changeItem(editingItem.id, { category: code, source: sourceFor(code, editingItem.source) })} />
            <SourceToggle value={editingItem.source} category={editingItem.category} onChange={value => changeItem(editingItem.id, { source: value })} />
            <Button onClick={() => setEditing(null)} className="w-full">{t('Done', 'முடிந்தது')}</Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
