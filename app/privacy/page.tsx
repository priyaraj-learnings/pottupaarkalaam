import type { Metadata } from 'next'

import { LegalPage } from '@/components/LegalPage'
import { PrivacyByLanguage } from '@/components/legal/PrivacyByLanguage'

export const metadata: Metadata = { title: 'Privacy Policy', alternates: { canonical: '/privacy' } }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <PrivacyByLanguage />
    </LegalPage>
  )
}
