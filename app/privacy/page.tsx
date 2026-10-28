import type { Metadata } from 'next'

import { LegalPage } from '@/components/LegalPage'
import { COMPANY } from '@/lib/legal'

export const metadata: Metadata = { title: 'Privacy Policy', alternates: { canonical: '/privacy' } }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <p>
          This policy explains what personal data PottuPaarkalaam collects and why, under India&rsquo;s Digital Personal
          Data Protection Act, 2023. The data fiduciary is {COMPANY.name}, {COMPANY.address}.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li><b>Account:</b> your email address and name, from Google or the email you sign in with.</li>
          <li><b>Mobile number (optional):</b> if you give it, and whether you agreed to hear about offers on it.</li>
          <li><b>Photos:</b> the photo of you and the photos of clothes you add, and the pictures we make from them.</li>
          <li><b>Payments:</b> the amount, date and UPI reference of your recharges, and the bank&rsquo;s credit message
            for that payment (which shows the payer&rsquo;s name or UPI ID).</li>
          <li><b>Usage:</b> your credits, try-ons and recharges, and basic technical logs (time, errors).</li>
        </ul>
      </section>

      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To make your try-on pictures and show them to you.</li>
          <li>To keep your credit balance and confirm your payments.</li>
          <li>To keep the service secure and answer your questions or complaints.</li>
          <li>To call or message you about your payments, pictures or account, if you gave your mobile number.</li>
          <li>To send you offers and news on WhatsApp or SMS, only if you ticked the box for it. You can untick it or
            remove your number any time from the account menu.</li>
        </ul>
        <p>We do not sell your data, show advertising, or use your photos to train AI models.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li><b>Photos and pictures:</b> deleted 3 days after you add them. You can delete all of them at once with
            &ldquo;Delete all my photos now&rdquo; in My pictures.</li>
          <li><b>Account, credits and payments:</b> kept while your account is open and then as long as tax and
            accounting law requires (usually 8 years for payment records).</li>
        </ul>
      </section>

      <section>
        <h2>Who processes it for us</h2>
        <ul>
          <li><b>OpenAI</b> (USA) makes the pictures from your photos. Under OpenAI&rsquo;s API terms it does not use
            them to train its models, and may keep them for up to 30 days to detect abuse.</li>
          <li><b>Supabase</b> stores your account, photos and records; <b>Google Cloud</b> runs the app; Google
            signs you in if you choose Google.</li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          You can ask to see, correct or delete your personal data, or withdraw your consent, by writing to
          {' '}{COMPANY.privacyEmail}. Deleting your account removes your photos at once; payment records we must keep by
          law are kept without your photos. If you are not satisfied, contact our Grievance Officer,
          {' '}{COMPANY.grievanceOfficer} ({COMPANY.grievanceEmail}), and then the Data Protection Board of India.
        </p>
      </section>
    </LegalPage>
  )
}
