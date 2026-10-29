import { COMPANY } from '@/lib/legal'

// The Privacy Policy, shown at /privacy and inside the app (LegalOverlay).
export function PrivacyContent() {
  return (
    <>
      <section>
        <p>
          This policy explains what personal data PottuPaarkalaam collects and why, under India&rsquo;s Digital Personal
          Data Protection Act, 2023. The data fiduciary is {COMPANY.name}, {COMPANY.address}.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li><b>Account:</b> your email address and name, from Google (see &ldquo;Signing in with Google&rdquo; below) or
            the email you sign in with; or your mobile number, if you sign in with it.</li>
          <li><b>Mobile number:</b> if you give it or verify it with an SMS code (sent by MSG91), and whether you agreed to
            hear about offers on it. A verified number may be needed for free credits, and belongs to one account only.</li>
          <li><b>Photos:</b> the photo of you and the photos of clothes you add, and the pictures we make from them. For a
            couple picture, also your partner&rsquo;s photo, which is kept and deleted exactly like yours. Each picture
            carries an &ldquo;AI-generated&rdquo; label and, inside the file, a note that it is AI-generated with its own ID
            (not your name, email or number), as Indian law requires.</li>
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
          <li><b>Pictures you save or share:</b> a picture you download or share is a copy outside our systems. We cannot
            delete it and are not responsible for what happens to it (Terms, section 7).</li>
          <li><b>Account, credits and payments:</b> kept while your account is open and then as long as tax and
            accounting law requires (usually 8 years for payment records).</li>
        </ul>
      </section>

      <section>
        <h2>How we protect your photos</h2>
        <p>
          Your photos and pictures are kept in private storage that only your signed-in account can open, sent over
          encrypted connections, and deleted after 3 days. Apart from the AI provider below, we do not share or publish
          them. If they are ever exposed
          through a break-in to our systems, we will tell you and the Data Protection Board of India as the law requires.
        </p>
      </section>

      <section>
        <h2>Signing in with Google</h2>
        <p>
          If you choose &ldquo;Continue with Google&rdquo;, Google shares your name, email address, profile picture link and
          a Google account ID with us, and nothing else: we do not ask for access to your Gmail, Drive, contacts, photos or
          any other Google data.
        </p>
        <ul>
          <li>We use your name and email only to create your account, sign you in, show who is signed in and contact you
            about your account, payments and complaints. We do not use the profile picture.</li>
          <li>They are stored with your account in our sign-in system (Supabase) and kept while your account is open.</li>
          <li>We do not sell or share them, use them for advertising, or use them to train AI models. People at
            {' '}{COMPANY.name} see them only to help you when you ask, for security, or when the law requires it.</li>
          <li>PottuPaarkalaam&rsquo;s use and transfer of information received from Google APIs adheres to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline" target="_blank" rel="noreferrer">Google
            API Services User Data Policy</a>, including the Limited Use requirements.</li>
          <li>You can remove PottuPaarkalaam&rsquo;s access at any time from your Google Account (Security → Your
            connections to third-party apps and services), and ask us to delete your account as described below.</li>
        </ul>
      </section>

      <section>
        <h2>Who processes it for us</h2>
        <ul>
          <li><b>OpenAI</b> (USA) makes the pictures from your photos. Under OpenAI&rsquo;s API terms it does not use
            them to train its models, and may keep them for up to 30 days to detect abuse.</li>
          <li><b>MSG91</b> (India) sends the sign-in code by SMS when you sign in with your mobile number.</li>
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
    </>
  )
}
