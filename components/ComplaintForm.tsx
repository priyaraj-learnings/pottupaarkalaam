'use client'

import { useState, type FormEvent } from 'react'

import { Button, Card, Notice } from '@/components/ui'
import { api, ApiFailure, errorMessage } from '@/lib/client/api'
import { tr, useT } from '@/lib/client/language'
import { COMPANY } from '@/lib/legal'
import { supabase } from '@/lib/supabase/browser'

type Category = 'MY_PHOTO_WITHOUT_CONSENT' | 'INTIMATE_OR_SEXUAL' | 'IMPERSONATION' | 'CHILD' | 'PRIVACY_REQUEST' | 'PAYMENT' | 'PICTURE_QUALITY' | 'OTHER'

const CATEGORIES: Array<{ value: Category; en: string; ta: string }> = [
  { value: 'MY_PHOTO_WITHOUT_CONSENT', en: 'A picture of me made without my consent', ta: 'என் அனுமதி இல்லாமல் உருவாக்கப்பட்ட என் படம்' },
  { value: 'INTIMATE_OR_SEXUAL', en: 'A sexual, nude or intimate picture', ta: 'ஆபாசமான, நிர்வாணமான அல்லது அந்தரங்கமான படம்' },
  { value: 'IMPERSONATION', en: 'A picture pretending to be someone (morphed / deepfake)', ta: 'வேறொருவர் போல் காட்டும் படம் (மார்ஃபிங் / டீப்ஃபேக்)' },
  { value: 'CHILD', en: 'A picture of a child', ta: 'ஒரு குழந்தையின் படம்' },
  { value: 'PRIVACY_REQUEST', en: 'My personal data (see, correct, delete)', ta: 'என் தனிப்பட்ட தரவு (பார்க்க, திருத்த, நீக்க)' },
  { value: 'PAYMENT', en: 'A payment or recharge', ta: 'பணம் செலுத்துதல் அல்லது ரீசார்ஜ்' },
  { value: 'PICTURE_QUALITY', en: 'A picture came out wrong', ta: 'படம் சரியாக வரவில்லை' },
  { value: 'OTHER', en: 'Something else', ta: 'வேறு ஏதாவது' },
]

type Sent = { ticket: string; urgent: boolean }

// Signed in: send the token (the complaint is linked to the account). Not
// signed in: a plain request.
async function post(body: Record<string, string>): Promise<Sent> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return api<Sent>('/api/complaints', { method: 'POST', json: body })
  let response: Response
  try {
    response = await fetch('/api/complaints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
  } catch {
    throw new ApiFailure(0, 'OFFLINE', tr('No internet connection. Please try again.', 'இணைய இணைப்பு இல்லை. மீண்டும் முயற்சி செய்யுங்கள்.'))
  }
  const payload = await response.json().catch(() => null) as (Sent & { error?: { code?: string; message?: string } }) | null
  if (!response.ok) {
    throw new ApiFailure(response.status, payload?.error?.code ?? 'UNAVAILABLE', payload?.error?.message ?? tr('Something went wrong. Please try again.', 'ஏதோ தவறு நடந்துவிட்டது. மீண்டும் முயற்சி செய்யுங்கள்.'))
  }
  return payload as Sent
}

// Who handles complaints, and how fast (IT Rules 2021, rule 3(2); Consumer
// Protection (E-Commerce) Rules 2020, rule 4(5)).
export function GrievanceOfficer() {
  const t = useT()
  return (
    <Card title={t('Grievance Officer', 'குறை தீர்க்கும் அலுவலர்')}>
      <div className="space-y-1 text-sm text-stone-700">
        <p className="font-bold text-stone-900">{COMPANY.grievanceOfficer}</p>
        <p>{t('Grievance Officer', 'குறை தீர்க்கும் அலுவலர்')}, {COMPANY.name}</p>
        <p>{COMPANY.address}</p>
        <p>
          <a href={`mailto:${COMPANY.grievanceEmail}`} className="font-semibold text-brand-700 underline [overflow-wrap:anywhere]">{COMPANY.grievanceEmail}</a>
          {' · '}
          <a href={COMPANY.supportPhoneLink} className="whitespace-nowrap font-semibold text-brand-700 underline">{COMPANY.supportPhone}</a>
        </p>
      </div>
      <ul className="mt-3 space-y-1 rounded-2xl bg-stone-50 p-3 text-sm text-stone-700">
        <li>{t('We acknowledge every complaint within 24 hours.', 'ஒவ்வொரு புகாரையும் 24 மணி நேரத்திற்குள் பெற்றதாகத் தெரிவிப்போம்.')}</li>
        <li>{t('We resolve it within 7 days.', '7 நாட்களுக்குள் தீர்த்து வைப்போம்.')}</li>
        <li className="font-bold text-red-800">{t('Intimate, impersonation or child pictures: we act within 2 hours.', 'அந்தரங்கமான, ஆள்மாறாட்ட அல்லது குழந்தைப் படங்கள்: 2 மணி நேரத்திற்குள் நடவடிக்கை எடுப்போம்.')}</li>
      </ul>
      <p className="mt-3 text-xs text-stone-500">
        {t('Not satisfied? Data Protection Board of India; National Consumer Helpline 1915.', 'திருப்தி இல்லையா? இந்தியத் தரவுப் பாதுகாப்பு வாரியம் (Data Protection Board of India); தேசிய நுகர்வோர் உதவி எண் 1915.')}
      </p>
    </Card>
  )
}

const inputClass = 'mt-1 block w-full rounded-2xl border border-stone-300 bg-white px-3 py-3 text-base font-normal'

export default function ComplaintForm() {
  const t = useT()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [pictureId, setPictureId] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<Sent | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError(t('Enter your name.', 'உங்கள் பெயரை உள்ளிடுங்கள்.'))
    if (contact.trim().length < 3) return setError(t('Enter an email address or mobile number we can reply to.', 'நாங்கள் பதில் அனுப்ப ஒரு மின்னஞ்சல் முகவரி அல்லது மொபைல் எண்ணை உள்ளிடுங்கள்.'))
    if (!category) return setError(t('Choose what the complaint is about.', 'புகார் எதைப் பற்றியது என்று தேர்ந்தெடுங்கள்.'))
    if (details.trim().length < 5) return setError(t('Tell us what happened.', 'என்ன நடந்தது என்று சொல்லுங்கள்.'))
    setBusy(true)
    setError('')
    try {
      setSent(await post({ name: name.trim(), contact: contact.trim(), category, pictureId: pictureId.trim(), details: details.trim() }))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (sendError) {
      setError(errorMessage(sendError))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Card>
        <div className="space-y-2 text-center">
          <p className="text-3xl" aria-hidden="true">✅</p>
          <h2 className="text-lg font-extrabold">{t('Complaint sent', 'புகார் அனுப்பப்பட்டது')}</h2>
          <p className="text-sm text-stone-600">{t('Your ticket number', 'உங்கள் புகார் எண்')}</p>
          <p className="select-all text-2xl font-black tracking-wide text-brand-700">{sent.ticket}</p>
          <p className="text-sm text-stone-700">{t('We will reply within 24 hours and resolve it within 7 days.', '24 மணி நேரத்திற்குள் பதில் தருவோம், 7 நாட்களுக்குள் தீர்த்து வைப்போம்.')}</p>
          {sent.urgent && <Notice tone="warning"><b>{t('We act on this within 2 hours.', 'இதன் மீது 2 மணி நேரத்திற்குள் நடவடிக்கை எடுப்போம்.')}</b></Notice>}
          <p className="text-xs text-stone-500">{t('Keep this number to ask about your complaint.', 'உங்கள் புகாரைப் பற்றிக் கேட்க இந்த எண்ணை வைத்துக்கொள்ளுங்கள்.')}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card title={t('Send a complaint', 'புகார் அனுப்பு')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block text-sm font-bold text-stone-700">
          {t('Your name', 'உங்கள் பெயர்')}
          <input value={name} onChange={event => setName(event.target.value)} maxLength={100} autoComplete="name" className={inputClass} />
        </label>
        <label className="block text-sm font-bold text-stone-700">
          {t('Email or mobile number to reply to', 'பதில் அனுப்ப மின்னஞ்சல் அல்லது மொபைல் எண்')}
          <input value={contact} onChange={event => setContact(event.target.value)} maxLength={200} autoComplete="email" inputMode="email" className={inputClass} />
        </label>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-bold text-stone-700">{t('What is it about?', 'இது எதைப் பற்றியது?')}</legend>
          {CATEGORIES.map(option => (
            <label key={option.value} className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold ring-1 ${category === option.value ? 'bg-brand-50 ring-brand-300' : 'ring-stone-200'}`}>
              <input type="radio" name="category" value={option.value} checked={category === option.value} onChange={() => setCategory(option.value)}
                className="h-5 w-5 shrink-0 accent-brand-600" />
              {t(option.en, option.ta)}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-bold text-stone-700">
          {t('Picture ID (optional)', 'படத்தின் ID (விருப்பம்)')}
          <input value={pictureId} onChange={event => setPictureId(event.target.value)} maxLength={60} placeholder="pp-…" autoCapitalize="none" spellCheck={false} className={inputClass} />
          <span className="mt-1 block text-xs font-normal text-stone-500">
            {t('Inside the picture\'s details, or the AI-generated label: it starts with pp-', 'படத்தின் விவரங்களில் அல்லது "AI-generated" குறியில் இருக்கும்: இது pp- என்று தொடங்கும்')}
          </span>
        </label>
        <label className="block text-sm font-bold text-stone-700">
          {t('What happened?', 'என்ன நடந்தது?')}
          <textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={3000} rows={5} className={inputClass} />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" busy={busy} className="w-full">{t('Send complaint', 'புகாரை அனுப்பு')}</Button>
      </form>
    </Card>
  )
}

export function ComplaintsIntro() {
  const t = useT()
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-black">{t('Complaints', 'புகார்கள்')}</h1>
      <p className="mt-1 text-sm text-stone-600">
        {t('Tell us about a picture, your personal data, a payment, or anything else. You do not need to sign in.', 'ஒரு படம், உங்கள் தனிப்பட்ட தரவு, பணம் செலுத்துதல் அல்லது வேறு எதைப் பற்றியும் எங்களிடம் சொல்லுங்கள். உள்நுழைய வேண்டியதில்லை.')}
      </p>
    </div>
  )
}
