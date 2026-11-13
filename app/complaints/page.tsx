import type { Metadata } from 'next'

import { BackButton } from '@/components/BackButton'
import ComplaintForm, { ComplaintsIntro, GrievanceOfficer } from '@/components/ComplaintForm'
import { LanguageToggle } from '@/components/LanguageSwitch'
import { LogoMark, Wordmark } from '@/components/Logo'

export const metadata: Metadata = {
  title: 'Complaints',
  description: 'Complaints and the Grievance Officer of PottuPaarkalaam (inaivu IT).',
  alternates: { canonical: '/complaints' },
}

// Public: anyone can send a complaint, signed in or not.
export default function ComplaintsPage() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-ivory/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2.5">
          <BackButton />
          <span className="flex min-w-0 items-center gap-1.5">
            <LogoMark size={32} />
            <span className="min-w-0"><Wordmark /></span>
          </span>
          <LanguageToggle />
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-5">
        <ComplaintsIntro />
        <GrievanceOfficer />
        <ComplaintForm />
      </main>
    </>
  )
}
