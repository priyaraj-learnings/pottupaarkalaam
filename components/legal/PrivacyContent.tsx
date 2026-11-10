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
            you and whether the invite credits were given.</li>
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
          <li>To give the invite credits to you and the friend who invited you (or whom you invited) once, and to stop the
            same mobile number earning them twice. The friend who invited you sees only how many friends joined, not who.</li>
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
          <li><b>Account and credits:</b> kept while your account is open, and deleted when you delete your account.</li>
          <li><b>Payments:</b> the amount, date and UPI reference of your recharges and the bank&rsquo;s message for them
            are kept as long as tax and accounting law requires (usually 8 years), without your name or email once you
            delete your account.</li>
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
          <li><b>Resend</b> (USA) sends our emails: it receives your email address, name and the email&rsquo;s contents.</li>
          <li><b>Supabase</b> stores your account, photos and records; <b>Google Cloud</b> runs the app; Google
            signs you in if you choose Google.</li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <ul>
          <li><b>Delete your account yourself:</b> account menu → <b>Delete my account</b>. This withdraws your consent and
            deletes at once your photos and pictures, your account, mobile number, offers and email choices, invite code and credits, and your
            sign-in. Only what is described under &ldquo;How long we keep it&rdquo; stays.</li>
          <li>You can also ask to see, correct or delete your personal data, or withdraw your consent, by writing to
            {' '}{COMPANY.privacyEmail} or calling {COMPANY.supportPhone}.</li>
          <li>If you are not satisfied, contact our Grievance Officer, {COMPANY.grievanceOfficer}
            {' '}({COMPANY.grievanceEmail}), and then the Data Protection Board of India.</li>
          <li>This policy and the consent screen can be read in English or Tamil (தமிழ்).</li>
        </ul>
      </section>
    </>
  )
}
