import Link from 'next/link'
import type { ReactNode } from 'react'

import { LogoMark, Wordmark } from '@/components/Logo'
import { TERMS_EFFECTIVE } from '@/lib/legal'

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-[calc(1.5rem+env(safe-area-inset-top))]">
      <Link href="/" className="flex items-center gap-2">
        <LogoMark size={36} />
        <Wordmark />
      </Link>
      <h1 className="mt-6 text-3xl font-black">{title}</h1>
      <p className="mt-1 text-sm text-stone-500">Effective {TERMS_EFFECTIVE}</p>
      <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-stone-700 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-stone-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
      <Link href="/" className="mt-10 inline-block font-bold text-brand-700 underline">Back to PottuPaarkalaam</Link>
    </main>
  )
}
