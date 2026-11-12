'use client'

import QRCode from 'qrcode'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { Button, Card, Notice, Spinner, useToast } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'

// /admin Settings → Models & shops: sample models customers can try clothes on,
// and shops with QR posters (lib/server/samples.ts, lib/server/shops.ts).

type SampleModel = { id: string; url: string; label: string; gender: 'WOMAN' | 'MAN' }
type Shop = { code: string; name: string; area: string | null; createdAt: string; signups: number; verified: number; withPictures: number; paidInr: number }

export function SampleModelsCard() {
  const toast = useToast()
  const [models, setModels] = useState<SampleModel[] | null>(null)
  const [label, setLabel] = useState('')
  const [gender, setGender] = useState<'WOMAN' | 'MAN'>('WOMAN')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api<{ models: SampleModel[] }>('/api/admin/sample-models').then(result => setModels(result.models)).catch(error => toast(errorMessage(error), 'error'))
  }, [toast])

  async function add(event: FormEvent) {
    event.preventDefault()
    const photo = file.current?.files?.[0]
    if (!photo) {
      toast('Choose a photo.', 'error')
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('photo', photo)
      form.append('label', label)
      form.append('gender', gender)
      form.append('agreed', String(agreed))
      setModels((await api<{ models: SampleModel[] }>('/api/admin/sample-models', { method: 'POST', body: form })).models)
      setLabel('')
      setAgreed(false)
      if (file.current) file.current.value = ''
      toast('Sample model added.')
    } catch (addError) {
      toast(errorMessage(addError), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(model: SampleModel) {
    if (!window.confirm(`Delete the sample model "${model.label}"?`)) return
    try {
      setModels((await api<{ models: SampleModel[] }>(`/api/admin/sample-models?id=${model.id}`, { method: 'DELETE' })).models)
    } catch (removeError) {
      toast(errorMessage(removeError), 'error')
    }
  }

  return (
    <Card title="Sample models (“Try it on a model first”)">
      <div className="space-y-3 text-sm text-stone-700">
        <p>
          Customers who don&rsquo;t want to use their own photo yet can pick one of these people instead (also before
          signing in). Use clear, full-length photos, facing the camera, in good light. Up to 12. They are public.
        </p>
        <Notice tone="warning">
          Only add a photo when the person in it has agreed in writing to it being shown to customers and used for try-on
          pictures. Do not use photos from the internet. If the photo itself is AI-made, it must carry an
          &ldquo;AI-generated&rdquo; label.
        </Notice>
        {models === null ? <Spinner className="h-6 w-6 text-brand-600" /> : (
          <div className="flex flex-wrap gap-3">
            {models.length === 0 && <p className="text-stone-500">None yet: the option stays hidden from customers until you add one.</p>}
            {models.map(model => (
              <figure key={model.id} className="w-24 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={model.url} alt={model.label} className="h-36 w-24 rounded-xl object-cover ring-1 ring-stone-200" />
                <figcaption className="mt-1 truncate text-xs font-semibold">{model.label}</figcaption>
                <button type="button" onClick={() => void remove(model)} className="text-xs font-bold text-red-700 underline">Delete</button>
              </figure>
            ))}
          </div>
        )}
        <form onSubmit={add} className="grid max-w-xl gap-3 rounded-2xl bg-stone-50 p-3">
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
          <label className="block font-bold">
            Name shown to customers
            <input value={label} onChange={event => setLabel(event.target.value)} maxLength={60} placeholder="e.g. Priya"
              className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" />
          </label>
          <div className="flex gap-4">
            {(['WOMAN', 'MAN'] as const).map(option => (
              <label key={option} className="flex items-center gap-2">
                <input type="radio" name="sample-gender" checked={gender === option} onChange={() => setGender(option)} className="accent-brand-600" />
                {option === 'WOMAN' ? 'Woman' : 'Man'}
              </label>
            ))}
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
            <span>The person in this photo agreed in writing to it being shown to customers and used for try-on pictures.</span>
          </label>
          <Button type="submit" busy={busy} disabled={!agreed} className="min-h-10 text-sm">Add sample model</Button>
        </form>
      </div>
    </Card>
  )
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string))

// An A4 poster for the shop's counter or wall, with its QR code.
async function printPoster(shop: Shop) {
  const link = `${window.location.origin}/?ref=${shop.code}`
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 900, errorCorrectionLevel: 'M' })
  const poster = window.open('', '_blank')
  if (!poster) throw new Error('Allow pop-ups for this site to print the poster.')
  poster.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>PottuPaarkalaam poster · ${escapeHtml(shop.name)}</title>
<style>
@page { size: A4; margin: 12mm }
body { margin: 0; font-family: system-ui, "Noto Sans Tamil", sans-serif; color: #292524; text-align: center }
.page { max-width: 180mm; margin: 0 auto; padding-top: 6mm }
h1 { color: #9f1239; font-size: 30pt; margin: 0 0 4mm }
.ta { font-size: 19pt; font-weight: 700; margin: 0 0 6mm; color: #44403c }
img { width: 110mm; height: 110mm }
.scan { font-size: 18pt; font-weight: 800; margin: 4mm 0 2mm }
.free { display: inline-block; background: #ecfdf5; color: #065f46; font-size: 16pt; font-weight: 800; padding: 3mm 6mm; border-radius: 6mm; margin: 4mm 0 }
.shop { font-size: 13pt; color: #57534e; margin-top: 6mm }
.brand { font-size: 22pt; font-weight: 900; color: #9f1239; margin-top: 2mm }
.small { font-size: 9pt; color: #78716c; margin-top: 4mm }
</style></head><body><div class="page">
<h1>See it on you before you buy!</h1>
<p class="ta">வாங்கும் முன், இந்த உடை உங்களுக்கு எப்படி இருக்கும் என்று பாருங்கள்!</p>
<img src="${qr}" alt="QR code">
<p class="scan">📷 Scan with your phone camera · போன் கேமராவில் ஸ்கேன் செய்யுங்கள்</p>
<p>Photograph the saree, blouse, dhoti or fabric, add your photo, and see yourself wearing it.</p>
<p class="free">🎁 Free pictures every month · மாதந்தோறும் இலவசப் படங்கள்</p>
<p class="brand">PottuPaarkalaam</p>
<p class="shop">${escapeHtml(shop.name)}${shop.area ? ` · ${escapeHtml(shop.area)}` : ''}</p>
<p class="small">${escapeHtml(link.replace(/^https?:\/\//, ''))} · Pictures are made by AI and are previews.</p>
</div><script>window.onload = () => setTimeout(() => window.print(), 300)</script></body></html>`)
  poster.document.close()
}

export function ShopsCard() {
  const toast = useToast()
  const [shops, setShops] = useState<Shop[] | null>(null)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<{ shops: Shop[] }>('/api/admin/shops').then(result => setShops(result.shops)).catch(error => toast(errorMessage(error), 'error'))
  }, [toast])
  useEffect(load, [load])

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      setShops((await api<{ shops: Shop[] }>('/api/admin/shops', { method: 'POST', json: { name, area } })).shops)
      setName('')
      setArea('')
      toast('Shop added. Print its poster below.')
    } catch (addError) {
      toast(errorMessage(addError), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(shop: Shop) {
    if (!window.confirm(`Delete ${shop.name}? Its poster will stop counting new customers (the link still opens the app).`)) return
    try {
      setShops((await api<{ shops: Shop[] }>(`/api/admin/shops?code=${shop.code}`, { method: 'DELETE' })).shops)
    } catch (removeError) {
      toast(errorMessage(removeError), 'error')
    }
  }

  return (
    <Card title="Shop QR posters">
      <div className="space-y-3 text-sm text-stone-700">
        <p>
          Give textile and tailoring shops a poster: &ldquo;Scan and see it on you&rdquo;. Each shop has its own QR code, so you
          can see which shops bring new customers (counted when someone makes an account within 7 days of scanning).
        </p>
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={name} onChange={event => setName(event.target.value)} placeholder="Shop name" maxLength={100}
            className="min-h-11 rounded-xl border border-stone-300 px-3" />
          <input value={area} onChange={event => setArea(event.target.value)} placeholder="Area (optional)" maxLength={100}
            className="min-h-11 rounded-xl border border-stone-300 px-3" />
          <Button type="submit" busy={busy} disabled={!name.trim()} className="min-h-11 text-sm">Add shop</Button>
        </form>
        {shops === null ? <Spinner className="h-6 w-6 text-brand-600" /> : shops.length === 0 ? <p className="text-stone-500">No shops yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead className="text-xs text-stone-500">
                <tr><th className="py-1">Shop</th><th>Joined</th><th>Verified</th><th>Made pictures</th><th>Paid</th><th /></tr>
              </thead>
              <tbody>
                {shops.map(shop => (
                  <tr key={shop.code} className="border-t border-stone-100">
                    <td className="py-2"><b>{shop.name}</b>{shop.area && <span className="text-stone-500"> · {shop.area}</span>}<br /><span className="font-mono text-xs text-stone-500">{shop.code}</span></td>
                    <td>{shop.signups}</td>
                    <td>{shop.verified}</td>
                    <td>{shop.withPictures}</td>
                    <td>₹{Number(shop.paidInr).toLocaleString('en-IN')}</td>
                    <td className="space-x-2 whitespace-nowrap text-right">
                      <Button variant="secondary" onClick={() => void printPoster(shop).catch(error => toast(errorMessage(error), 'error'))} className="min-h-9 px-3 text-xs">Print poster</Button>
                      <button type="button" onClick={() => void remove(shop)} className="text-xs font-bold text-red-700 underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}
