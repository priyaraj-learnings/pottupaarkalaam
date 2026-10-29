'use client'

import { useState } from 'react'

import { Button, Notice, Sheet } from '@/components/ui'
import { api, errorMessage } from '@/lib/client/api'
import type { Account } from '@/lib/client/types'
import { COMPANY } from '@/lib/legal'

// "Delete my account" (DPDP Act 2023, sections 6(4) and 12): as easy as signing
// up, from the account menu. The server deletes the photos, account, credits
// and sign-in, and keeps only the payment records tax law needs.
// Admin accounts see why they cannot be deleted here (so nobody locks the
// admin out by mistake).
export function DeleteAccount({ account, isAdmin, onDeleted }: { account: Account; isAdmin: boolean; onDeleted: () => void }) {
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
        Delete my account
      </button>
      <Sheet open={open} title="Delete your account?" onClose={close}>
        {isAdmin ? (
          <div className="space-y-3 text-[15px] text-stone-700">
            <Notice tone="info">
              This is an <b>admin account</b>, so it cannot be deleted from the app. Customers see the delete steps here.
              To delete this account, first remove it from <code>app_admins</code> in Supabase.
            </Notice>
            <Button variant="secondary" onClick={close} className="w-full">Close</Button>
          </div>
        ) : (
        <div className="space-y-3 text-[15px] text-stone-700">
          <p>This deletes, straight away and for good:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>your photos and pictures (save any you want first)</li>
            <li>your account, mobile number and offers choice</li>
            <li>
              your credits: {account.freeLeft} free
              {account.credits > 0 ? <> and <b>{account.credits} paid credit{account.credits === 1 ? '' : 's'}, which are not refunded</b></> : null}
            </li>
          </ul>
          <p className="text-sm text-stone-600">
            We keep only what tax law needs: the amount, date and UPI reference of your recharges, without your name or
            email. Questions: {COMPANY.supportPhone} or {COMPANY.privacyEmail}.
          </p>
          <label className="flex items-start gap-3 rounded-2xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-100">
            <input type="checkbox" checked={sure} onChange={event => setSure(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-red-600" />
            <span>I understand. Delete my account and everything in it.</span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="grid grid-cols-1 gap-2">
            <Button variant="danger" busy={busy} disabled={!sure} onClick={remove} className="w-full">Delete my account</Button>
            <Button variant="ghost" disabled={busy} onClick={close} className="w-full">Keep my account</Button>
          </div>
        </div>
        )}
      </Sheet>
    </>
  )
}
