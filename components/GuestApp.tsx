'use client'

import { useCallback, useState } from 'react'

import { LanguageToggle } from '@/components/LanguageSwitch'
import { LogoMark, Wordmark } from '@/components/Logo'
import { SignInOptions, useSignInOptions } from '@/components/SignIn'
import { useT } from '@/lib/client/language'
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
// invited: opened from a friend's invite link.
export default function GuestApp({ notice, invited = false }: { notice?: string; invited?: boolean }) {
  const options = useSignInOptions()
  const t = useT()
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
            {/* Hidden on narrow phones so the buttons fit (the logo stays). */}
            <span className="min-w-0 max-[419px]:hidden"><Wordmark /></span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <button type="button" onClick={() => setSheet('plain')} className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-brand-700 shadow-sm ring-1 ring-brand-200">
              {t('Sign in', 'உள்நுழை')}
            </button>
          </div>
        </header>

        <main className="px-4 pt-2">
          {notice && <div className="mb-3"><Notice tone="success">{notice}</Notice></div>}
          {invited && options.shop && (
            <p className="mb-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 ring-1 ring-emerald-200">
              🛍️ {t(`Welcome from ${options.shop}! Photograph any saree or fabric there and see it on you.`, `${options.shop} வழியாக வந்ததற்கு நன்றி! அங்குள்ள எந்தப் புடவையையோ துணியையோ படம் எடுத்து உங்கள் மேல் பாருங்கள்.`)}
            </p>
          )}
          {invited && !options.shop && options.referralCredits > 0 && (
            <p className="mb-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 ring-1 ring-emerald-200">
              🎁 {t(`A friend invited you: join and verify your mobile number, and you both get ${options.referralCredits} extra free pictures.`, `உங்கள் நண்பர் உங்களை அழைத்துள்ளார்: சேர்ந்து உங்கள் மொபைல் எண்ணைச் சரிபார்த்தால், உங்கள் இருவருக்கும் ${options.referralCredits} கூடுதல் இலவசப் படங்கள் கிடைக்கும்.`)}
            </p>
          )}

          <section className="mb-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200/70">
            <div className="px-4 pb-3 pt-4">
              <h1 className="text-xl font-black leading-snug">{t('See yourself in it before you stitch or buy.', 'தைக்கும் முன், வாங்கும் முன் உங்கள் மேல் எப்படி இருக்கும் என்று பாருங்கள்.')}</h1>
              <p className="mt-1 text-sm text-stone-600">{t('Photograph the fabric or dress, add your photo, and see yourself wearing it.', 'துணியையோ உடையையோ புகைப்படம் எடுங்கள், உங்கள் புகைப்படத்தைச் சேருங்கள், அதை நீங்கள் அணிந்திருப்பதைப் பாருங்கள்.')}</p>
            </div>
            <figure className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/example-saree.webp" width={480} height={300} alt={t('Example: a saree on a mannequin, and an AI-made picture of a woman wearing it', 'எடுத்துக்காட்டு: பொம்மை மேல் ஒரு புடவை, அதை ஒரு பெண் அணிந்திருப்பது போல AI உருவாக்கிய படம்')} className="block h-auto w-full" />
              <figcaption className="absolute inset-x-0 top-2 flex justify-between px-2 text-xs font-extrabold">
                <span className="rounded-full bg-white/90 px-2 py-0.5 text-stone-800">{t('Your photo of the saree', 'நீங்கள் எடுத்த புடவைப் புகைப்படம்')}</span>
                <span className="rounded-full bg-white/90 px-2 py-0.5 text-brand-700">{t('You, wearing it', 'அதை அணிந்த நீங்கள்')} ✨</span>
              </figcaption>
            </figure>
            <p className="bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-800">
              {free ? t(`${free} free pictures every month`, `ஒவ்வொரு மாதமும் ${free} இலவசப் படங்கள்`) : t('Free pictures every month', 'ஒவ்வொரு மாதமும் இலவசப் படங்கள்')} · {t('start now, sign in when you try on', 'இப்போதே தொடங்குங்கள், அணிந்து பார்க்கும்போது உள்நுழையுங்கள்')}
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

        <Sheet open={sheet !== null} title={sheet === 'tryon' ? t('Your picture is ready to make ✨', 'உங்கள் படம் உருவாக்கத் தயார் ✨') : t('Sign in', 'உள்நுழை')} onClose={close}>
          <p className="mb-4 text-sm text-stone-600">
            {sheet === 'tryon'
              ? <>{t('Sign in to see it.', 'அதைப் பார்க்க உள்நுழையுங்கள்.')} <b>{free ? t(`${free} free pictures every month`, `ஒவ்வொரு மாதமும் ${free} இலவசப் படங்கள்`) : t('Free pictures every month', 'ஒவ்வொரு மாதமும் இலவசப் படங்கள்')}</b>. {t('Your photos stay on this phone until you agree to our terms in the next step.', 'அடுத்த படியில் எங்கள் விதிமுறைகளுக்கு நீங்கள் ஒப்புக்கொள்ளும் வரை உங்கள் புகைப்படங்கள் இந்த ஃபோனிலேயே இருக்கும்.')}</>
              : <>{t('Sign in to see your pictures and credits. New here?', 'உங்கள் படங்களையும் கிரெடிட்களையும் பார்க்க உள்நுழையுங்கள். புதியவரா?')} {free ? t(`${free} free pictures every month.`, `ஒவ்வொரு மாதமும் ${free} இலவசப் படங்கள்.`) : t('Free pictures every month.', 'ஒவ்வொரு மாதமும் இலவசப் படங்கள்.')}</>}
          </p>
          <SignInOptions phoneWidget={options.phone} />
        </Sheet>
      </div>
    </ToastProvider>
  )
}
