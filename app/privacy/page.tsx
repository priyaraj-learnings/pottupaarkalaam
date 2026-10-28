import type { Metadata } from 'next'

import { LegalPage } from '@/components/LegalPage'
import { PrivacyContent } from '@/components/legal/PrivacyContent'

export const metadata: Metadata = { title: 'Privacy Policy', alternates: { canonical: '/privacy' } }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <PrivacyContent />
    </LegalPage>
  )
}
