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
            hear about offers on it. Free credits need a verified number, and a verified number belongs to one account only.</li>
          <li><b>Photos:</b> the photo of you and the photos of clothes you add, and the pictures we make from them. For a
            couple picture, also your partner&rsquo;s photo, which is kept and deleted exactly like yours. Each picture
            carries an &ldquo;AI-generated&rdquo; label and, inside the file, a note that it is AI-generated with its own ID
            (not your name, email or number), as Indian law requires.</li>
          <li><b>Payments:</b> the amount, date and UPI reference of your recharges, and the bank&rsquo;s credit message
            for that payment (which shows the payer&rsquo;s name or UPI ID).</li>
          <li><b>Usage:</b> your credits, try-ons and recharges, and basic technical logs (time, errors).</li>
          <li><b>Email choices:</b> whether you want the monthly email and offers and news by email, and when you
            changed that.</li>
          <li><b>Invites:</b> your invite code, and if you joined with a friend&rsquo;s invite link, which account invited
            you and whether the invite credits were given. If you came from a shop&rsquo;s PottuPaarkalaam poster, which shop
            (so we know which shops bring customers; the shop does not see who you are).</li>
          <li><b>Notifications:</b> if you tap &ldquo;Notify me&rdquo;, the address your browser gives us for sending this
            phone a &ldquo;your picture is ready&rdquo; notification. The notification carries no personal data.</li>
          <li><b>Website visits:</b> counted without cookies, to know how many people visit. From your internet address
            and browser we make a one-way code with a key that changes every day, and keep it for that day only; after
            that only the number of visitors per day stays. We do not store your internet address.</li>
        </ul>
      </section>

      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To make your try-on pictures and show them to you.</li>
          <li>To keep your credit balance and confirm your payments.</li>
          <li>To give the monthly free credits to one verified mobile number, and stop the same number getting them twice.</li>
          <li>To keep the service secure and answer your questions or complaints.</li>
          <li>To call or message you about your payments, pictures or account, if you gave your mobile number.</li>
          <li>To send you offers and news on WhatsApp or SMS, only if you ticked the box for it. You can untick it or
            remove your number any time from the account menu.</li>
          <li>To send you offers and news by email (new features, festival offers), only if you ticked &ldquo;Send me
            offers and news by email&rdquo;. You can untick it any time from the account menu.</li>
          <li>Once a month, on the 1st, to email you that your free pictures are back, if you did not use all of last
            month&rsquo;s. Every such email has a &ldquo;Stop these emails&rdquo; link, and you can switch it off in the
            account menu (&ldquo;Monthly email&rdquo;).</li>
          <li>To tell your phone when your pictures are ready, only if you turned it on. You can turn it off in your
            phone&rsquo;s or browser&rsquo;s notification settings.</li>
          <li>The photo check (light, sharpness, face) runs on your phone: nothing extra is sent to us for it.</li>
          <li>To give the invite credits to you and the friend who invited you (or whom you invited) once, and to stop the
            same mobile number earning them twice. The friend who invited you sees only how many friends joined, not who.</li>
        </ul>
        <p>We do not sell your data, show advertising, or use your photos to train AI models.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li><b>Photos and pictures:</b> deleted from our servers 3 days after you add them. You can delete all of them at
            once with &ldquo;Delete all my photos now&rdquo; in My pictures. Our AI provider (OpenAI) may keep a copy of the
            photos it receives for up to 30 days, only to check for misuse, and then deletes it.</li>
          <li><b>Pictures you save or share:</b> a picture you download or share is a copy outside our systems. We cannot
            delete it and are not responsible for what happens to it (Terms, section 7).</li>
          <li><b>Account and credits:</b> kept while your account is open, and deleted when you delete your account.</li>
          <li><b>Payments:</b> the amount, date and UPI reference of your recharges and the bank&rsquo;s message for them
            are kept as long as tax and accounting law requires (usually 8 years). When you delete your account, your name,
            email and the bank&rsquo;s message (which shows the payer&rsquo;s name) are removed; the amount, date and
            reference stay. Bank messages that match no recharge are cleared after 90 days.</li>
          <li><b>Record of use:</b> what you did in the app and when (for example &ldquo;made a picture&rdquo;), with your
            internet address; no photos. Kept 1 year, for security, complaints and as Indian law requires.</li>
          <li><b>After you delete your account:</b> your sign-in email or mobile number and name are kept 180 days, only for
            investigations the law requires, then deleted.</li>
          <li><b>Complaints and problem reports:</b> a picture you report is kept up to 7 days so we can look at it. Complaint
            records are kept 3 years.</li>
          <li><b>If a picture is taken down or an account is blocked</b> for breaking the Terms, its photos and records are
            kept 180 days as evidence, as the IT Rules require, and the account cannot be deleted until the review ends.</li>
          <li><b>After you delete your account or change your verified number:</b> if you used free credits this month
            with a verified mobile number, we keep a one-way code made from that number (not the number itself) until the end of the month, so the same
            number does not get that month&rsquo;s free credits twice. Then it is deleted.</li>
          <li><b>Invites:</b> if your verified number earned invite credits, we keep a one-way code made from it (not the
            number itself) for as long as invites give credits, even after you delete your account, so the same number does
            not earn them twice.</li>
        </ul>
      </section>

      <section>
        <h2>How we protect your photos</h2>
        <p>
          Your photos and pictures are kept in private storage that only your signed-in account can open, sent over
          encrypted connections, and deleted from our servers after 3 days. Apart from the AI provider below, we do not share
          or publish them. If a personal data breach affects your data, at our systems or at a provider that processes it
          for us, we will tell you and the Data Protection Board of India as the law requires.
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
            about your account, payments and complaints, for the monthly free-pictures email (which you can stop), and for
            offers and news by email only if you ticked the box for it. We do not use the profile picture.</li>
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
          <li><b>MSG91</b> (India) sends the code by SMS when you sign in with your mobile number or verify your number.</li>
          <li>Your browser&rsquo;s push service (<b>Google</b>, <b>Apple</b>, <b>Mozilla</b> or <b>Microsoft</b>) delivers
            picture-ready notifications, if you turned them on.</li>
          <li><b>Resend</b> (USA) sends our emails: it receives your email address, name and the email&rsquo;s contents.</li>
          <li><b>Supabase</b> stores your account, photos and records, in India (Mumbai); <b>Google Cloud</b> runs the
            app; Google signs you in if you choose Google.</li>
          <li><b>Google (Gmail)</b>: our own mailbox receives the bank&rsquo;s payment alert emails, which a small script
            passes to the app to confirm recharges.</li>
          <li><b>Telegram</b> carries our staff&rsquo;s alerts about recharges to check: only the amount, credits and the
            last 4 digits of the UPI reference, never your name, email or number.</li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <ul>
          <li><b>Delete your account yourself:</b> account menu → <b>Delete my account</b>. This withdraws your consent and
            deletes at once your photos and pictures, your account, mobile number, offers and email choices, invite code and credits, and your
            sign-in. Only what is described under &ldquo;How long we keep it&rdquo; stays.</li>
          <li>You can also ask to see, correct or delete your personal data, or withdraw your consent, by writing to
            {' '}{COMPANY.privacyEmail} or calling {COMPANY.supportPhone}. Write from, or tell us, your account&rsquo;s email or
            mobile number so we can find it.</li>
          <li>You can ask for a summary of the personal data we hold about you, what we do with it, and the list of
            providers we have shared it with.</li>
          <li>You can name another person to use these rights for you if you die or cannot act yourself.</li>
          <li>We reply within 7 days, and never later than 90 days.</li>
          <li><b>If someone added your photo without asking you:</b> write to {COMPANY.grievanceEmail}, whether or not you
            have an account. We delete your photo and the pictures made from it at once (within 2 hours for sexual,
            intimate or impersonating pictures).</li>
          <li>If you are not satisfied, contact our Grievance Officer, {COMPANY.grievanceOfficer}
            {' '}({COMPANY.grievanceEmail}), and then the Data Protection Board of India.</li>
          <li>This policy and the consent screen can be read in English or Tamil (தமிழ்). Ask us if you need this notice in
            another Indian language.</li>
        </ul>
      </section>
    </>
  )
}
