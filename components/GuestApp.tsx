'use client'

import { useCallback, useState } from 'react'

import { LogoMark, Wordmark } from '@/components/Logo'
import { SignInOptions, useSignInOptions } from '@/components/SignIn'
import TryOn from '@/components/TryOn'
import { Notice, Sheet, ToastProvider } from '@/components/ui'

// =======================================================
// BEFORE SIGNING IN
//
// Visitors start straight away: choose the clothes and take the
// photos (they stay on the phone). Sign-in is asked for at "Try
// on", with their choices kept: after sign-in and the terms the
// picture is made (TryOn, lib/client/tryOnDraft.ts).
// =======================================================

// notice: shown at the top (for example after deleting an account).
export default function GuestApp({ notice }: { notice?: string }) {
  const options = useSignInOptions()
  // 'tryon': opened by "Try on" (their picture is waiting); 'plain': "Sign in".
  const [sheet, setSheet] = useState<'tryon' | 'plain' | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const free = options.freeCreditsPerMonth

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh max-w-md">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 bg-ivory/95 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <span className="flex min-w-0 items-center gap-2">
            <LogoMark size={36} />
            <Wordmark />
          </span>
          <button type="button" onClick={() => setSheet('plain')} className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-brand-700 shadow-sm ring-1 ring-brand-200">
            Sign in
          </button>
        </header>

        <main className="px-4 pt-2">
          {notice && <div className="mb-3"><Notice tone="success">{notice}</Notice></div>}

          <section className="mb-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200/70">
            <div className="px-4 pb-3 pt-4">
              <h1 className="text-xl font-black leading-snug">See yourself in it before you stitch or buy.</h1>
              <p className="mt-1 text-sm text-stone-600">Photograph the fabric or dress, add your photo, and see yourself wearing it.</p>
            </div>
            <figure className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/example-saree.webp" width={480} height={300} alt="Example: a saree on a mannequin, and an AI-made picture of a woman wearing it" className="block h-auto w-full" />
              <figcaption className="absolute inset-x-0 top-2 flex justify-between px-2 text-xs font-extrabold">
                <span className="rounded-full bg-white/90 px-2 py-0.5 text-stone-800">Your photo of the saree</span>
                <span className="rounded-full bg-white/90 px-2 py-0.5 text-brand-700">You, wearing it ✨</span>
              </figcaption>
            </figure>
            <p className="bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-800">
              {free ? `${free} free pictures every month` : 'Free pictures every month'} · start now, sign in when you try on
            </p>
          </section>

          <TryOn
            account={null}
            settings={null}
            onAccount={() => {}}
            onRecharge={() => setSheet('tryon')}
            onTermsNeeded={() => setSheet('tryon')}
            guest={{ freeCreditsPerMonth: free, onSignIn: () => setSheet('tryon') }}
          />
        </main>

        <Sheet open={sheet !== null} title={sheet === 'tryon' ? 'Your picture is ready to make ✨' : 'Sign in'} onClose={close}>
          <p className="mb-4 text-sm text-stone-600">
            {sheet === 'tryon'
              ? <>Sign in to see it. <b>{free ? `${free} free pictures every month` : 'Free pictures every month'}</b>. Your photos stay on this phone until you agree to our terms in the next step.</>
              : <>Sign in to see your pictures and credits. New here? {free ? `${free} free pictures every month.` : 'Free pictures every month.'}</>}
          </p>
          <SignInOptions phoneWidget={options.phone} />
        </Sheet>
      </div>
    </ToastProvider>
  )
}
