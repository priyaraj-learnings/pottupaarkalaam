import type { ReactNode } from 'react'

import { BackButton } from '@/components/BackButton'
import { LEGAL_TEXT } from '@/components/legal/styles'
import { LogoMark, Wordmark } from '@/components/Logo'
import { TERMS_EFFECTIVE } from '@/lib/legal'

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-ivory/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-2.5">
          <BackButton />
          <span className="flex min-w-0 items-center gap-2">
            <LogoMark size={32} />
            <Wordmark />
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-6">
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-1 text-sm text-stone-500">Effective {TERMS_EFFECTIVE}</p>
        <div className={`mt-6 ${LEGAL_TEXT}`}>
          {children}
        </div>
        <BackButton className="mt-10" />
      </main>
    </>
  )
}
