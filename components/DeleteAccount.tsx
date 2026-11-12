'use client'

import { useState } from 'react'

import { Button, Notice, Sheet } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import { useLanguage, useT } from '@/lib/client/language'
import type { Account } from '@/lib/client/types'
import { COMPANY } from '@/lib/legal'

// "Delete my account" (DPDP Act 2023, sections 6(4) and 12): as easy as signing
// up, from the account menu. The server deletes the photos, account, credits
// and sign-in, and keeps only the payment records tax law needs.
// Admin accounts see why they cannot be deleted here (so nobody locks the
// admin out by mistake).
export function DeleteAccount({ account, isAdmin, onDeleted }: { account: Account; isAdmin: boolean; onDeleted: () => void }) {
  const t = useT()
  const ta = useLanguage() === 'ta'
  const [open, setOpen] = useState(false)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await api('/api/me', { method: 'DELETE' })
      onDeleted()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
      setBusy(false)
    }
  }

  const close = () => {
    if (busy) return
    setOpen(false)
    setSure(false)
    setError('')
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full py-2 text-center text-sm font-semibold text-red-700 underline">
        {t('Delete my account', 'என் கணக்கை நீக்கு')}
      </button>
      <Sheet open={open} title={t('Delete your account?', 'உங்கள் கணக்கை நீக்கவா?')} onClose={close}>
        {isAdmin ? (
          <div className="space-y-3 text-[15px] text-stone-700">
            <Notice tone="info">
              {ta ? (
                <>
                  இது ஒரு <b>admin கணக்கு</b>, அதனால் இதைச் செயலியிலிருந்து நீக்க முடியாது. வாடிக்கையாளர்கள் இங்கே நீக்கும் படிகளைப் பார்ப்பார்கள்.
                  இந்தக் கணக்கை நீக்க, முதலில் Supabase-இல் <code>app_admins</code>-இலிருந்து அதை எடுத்துவிடுங்கள்.
                </>
              ) : (
                <>
                  This is an <b>admin account</b>, so it cannot be deleted from the app. Customers see the delete steps here.
                  To delete this account, first remove it from <code>app_admins</code> in Supabase.
                </>
              )}
            </Notice>
            <Button variant="secondary" onClick={close} className="w-full">{t('Close', 'மூடு')}</Button>
          </div>
        ) : (
        <div className="space-y-3 text-[15px] text-stone-700">
          <p>{t('This deletes, straight away and for good:', 'இது உடனே, நிரந்தரமாக நீக்கிவிடும்:')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('your photos and pictures (save any you want first)', 'உங்கள் புகைப்படங்களும் படங்களும் (வேண்டியவற்றை முதலில் சேமித்துக்கொள்ளுங்கள்)')}</li>
            <li>{t('your account, mobile number and offers choice', 'உங்கள் கணக்கு, மொபைல் எண், சலுகைகள் விருப்பம்')}</li>
            <li>
              {t(`your credits: ${account.freeLeft} free`, `உங்கள் கிரெடிட்கள்: ${account.freeLeft} இலவசம்`)}
              {account.credits > 0 ? (ta
                ? <>, மேலும் <b>{account.credits} கட்டண {account.credits === 1 ? 'கிரெடிட்' : 'கிரெடிட்கள்'} (இவற்றுக்குப் பணம் திருப்பித் தரப்படாது)</b></>
                : <> and <b>{account.credits} paid credit{account.credits === 1 ? '' : 's'}, which are not refunded</b></>) : null}
            </li>
          </ul>
          <p className="text-sm text-stone-600">
            {t(
              `We keep only what tax law needs: the amount, date and UPI reference of your recharges, without your name or email. Questions: ${COMPANY.supportPhone} or ${COMPANY.privacyEmail}.`,
              `வரிச் சட்டத்திற்குத் தேவையானதை மட்டும் வைத்திருப்போம்: உங்கள் ரீசார்ஜ்களின் தொகை, தேதி, UPI குறிப்பு எண், உங்கள் பெயரோ email-ஓ இல்லாமல். கேள்விகளுக்கு: ${COMPANY.supportPhone} அல்லது ${COMPANY.privacyEmail}.`,
            )}
          </p>
          <label className="flex items-start gap-3 rounded-2xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-100">
            <input type="checkbox" checked={sure} onChange={event => setSure(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-red-600" />
            <span>{t('I understand. Delete my account and everything in it.', 'புரிந்தது. என் கணக்கையும் அதிலுள்ள அனைத்தையும் நீக்கு.')}</span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="grid grid-cols-1 gap-2">
            <Button variant="danger" busy={busy} disabled={!sure} onClick={remove} className="w-full">{t('Delete my account', 'என் கணக்கை நீக்கு')}</Button>
            <Button variant="ghost" disabled={busy} onClick={close} className="w-full">{t('Keep my account', 'என் கணக்கை வைத்திரு')}</Button>
          </div>
        </div>
        )}
      </Sheet>
    </>
  )
}
