import type { Metadata } from 'next'

import { LegalPage } from '@/components/LegalPage'
import { TermsByLanguage } from '@/components/legal/TermsByLanguage'

export const metadata: Metadata = { title: 'Terms of Use', alternates: { canonical: '/terms' } }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <TermsByLanguage />
    </LegalPage>
  )
}
