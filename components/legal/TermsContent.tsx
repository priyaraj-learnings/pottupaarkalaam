import { COMPANY } from '@/lib/legal'

// The Terms of Use, shown at /terms and inside the app (LegalOverlay).
export function TermsContent() {
  return (
    <>
      <section>
        <h2>1. About PottuPaarkalaam</h2>
        <p>
          PottuPaarkalaam (போட்டுப்பார்க்கலாம், at pp.inaivuit.com) is run by {COMPANY.name}, {COMPANY.description},
          {' '}{COMPANY.address}. It makes AI pictures that show you wearing a fabric or dress you photograph. By using it
          you agree to these terms. Customer care: {COMPANY.supportPhone}, {COMPANY.supportEmail}.
        </p>
      </section>

      <section>
        <h2>2. Pictures are previews</h2>
        <p>
          Pictures are made by an artificial intelligence (AI) model. They are an idea of how something may look, not a
          promise. Colour, fit, drape, stitching and size of the real garment may be different. Do not rely on a picture
          alone when buying, stitching or tailoring.
        </p>
      </section>

      <section>
        <h2>3. Who can use it, and which photos</h2>
        <ul>
          <li>You must be 18 or older.</li>
          <li>Add only photos of yourself, or of an adult who has agreed to it. Never add photos of children.</li>
          <li>A couple picture uses photos of two people. Add it only when both of you are 18 or older and both agree.</li>
          <li>Do not use PottuPaarkalaam to make a picture of someone who has not agreed (including famous people), to pass
            a picture off as a real photo, or for anything that breaks Indian law. We may remove such pictures, block the
            account and report it to the authorities where the law requires.</li>
          <li>Do not add nude, sexual, violent or hateful photos, or photos meant to embarrass, deceive or impersonate anyone.</li>
          <li>Add photos of clothes you have the right to use.</li>
          <li>Do not give us another person&rsquo;s photo, or their details, unless they agreed (Digital Personal Data
            Protection Act 2023, section 15).</li>
          <li>Do not upload or make anything that: belongs to someone else without their permission; is obscene, sexual,
            paedophilic or invades someone&rsquo;s bodily privacy; harasses or insults anyone on grounds of gender, caste,
            religion or race; is harmful to children; infringes a trademark, copyright or other right; misleads people about
            where it came from or is plainly false; pretends to be another person; threatens the unity, security or public
            order of India or friendly relations with other countries; contains viruses or harmful code; or breaks any law.</li>
          <li>Making or sharing an unlawful AI picture, such as a picture of someone without their consent, a sexual or
            morphed picture, or one used to cheat or impersonate, can be punished under the Information Technology Act 2000
            (sections 66C, 66D, 66E, 67, 67A and 67B), the Bharatiya Nyaya Sanhita 2023, the POCSO Act 2012 and other laws.
            Where the law requires it, we report it to the police or the authorities.</li>
          <li>If we learn that an account is used by someone under 18, or that a photo shows a child, we delete the photos
            and pictures and may close the account.</li>
          <li>We may block an account that breaks these rules, without refund of unused credits.</li>
        </ul>
      </section>

      <section>
        <h2>4. Credits, prices and recharges</h2>
        <ul>
          <li>An account with a mobile number verified by an SMS code gets free credits each calendar month (shown in the
            app). Unused free credits do not carry over. Without a verified number you can still use the service with paid
            credits.</li>
          <li>One mobile number can belong to one account only, so free credits go to one number a month. Making extra
            accounts, or moving a number between accounts, to get more free credits is not allowed.</li>
          <li>One garment makes one picture for 1 credit. Two garments worn together (a pair) make one picture for 2 credits.</li>
          <li>A try takes up to 3 photos of clothes. If you have made a recharge in the same calendar month (and the service
            offers it), you can add a 4th and 5th photo; each of those pictures uses the extra credits shown in the app, from
            paid credits only.</li>
          <li>A couple picture (two people, each in their own garment), when offered and turned on in the account menu, uses
            the number of credits shown in the app, from paid credits only: free credits cannot be used for it.</li>
          <li>You buy credits by paying {COMPANY.name} by UPI and entering the UPI reference (UTR). The price per credit
            depends on the recharge amount, as shown in the app before you pay. Credits are added when the payment is
            confirmed, usually within a few hours.</li>
          <li>Paid credits do not expire while the service runs. Credits can be used only on PottuPaarkalaam: they cannot
            be transferred to another account, sold, or exchanged for cash, except for the refunds in section 5.</li>
          <li>The prices shown in the app are the full prices: nothing is added when you pay.</li>
          <li>If a picture cannot be made, its credits are returned automatically.</li>
          <li><b>Starter pack:</b> when offered, your first recharge can be the starter pack shown in the app (its price and
            credits), even below the smallest recharge. Once per account; its credits are paid credits like any other.</li>
          <li><b>Sample models:</b> you may try clothes on the sample models shown in the app instead of your own photo. Use
            those pictures only to decide what to buy or stitch, never to present them as the model wearing your product.</li>
          <li><b>Invite friends:</b> when someone opens PottuPaarkalaam for the first time with your invite link, makes an
            account within 7 days and verifies their mobile number, you and they each get the invite credits shown in the
            app, for up to the number of friends shown there. A mobile number earns invite credits once, ever. Invite credits
            are paid credits given free: they follow these terms but are not refunded in cash. Inviting yourself, or making
            accounts or using numbers just to collect invite credits, is not allowed: we may then remove those credits. We
            may change or end the invite offer at any time; credits already given stay.</li>
        </ul>
      </section>

      <section>
        <h2>5. Refunds</h2>
        <ul>
          <li>Credits used for a picture that was made are not refunded.</li>
          <li>If you paid twice, paid the wrong amount, or paid but no credits were added, write to {COMPANY.supportEmail}{' '}
            with your UPI reference. We refund the money to the account it came from within 7 working days of confirming it.</li>
          <li>Unused paid credits are refunded on request if we close the service.</li>
          <li>You can delete your account at any time from the account menu. Its unused credits end with it and are not
            refunded.</li>
        </ul>
      </section>

      <section>
        <h2>6. Your photos</h2>
        <p>
          Your photos and pictures are deleted from our servers 3 days after you add them, or earlier if you tap
          {' '}&ldquo;Delete all my photos now&rdquo;. Our AI provider may keep a copy for up to 30 days, only to check for
          misuse, and then deletes it. Save the pictures you want to keep. See the Privacy Policy for details.
          You own your photos; you allow us to use them only to make your pictures.
        </p>
      </section>

      <section>
        <h2>7. Pictures you save or share</h2>
        <ul>
          <li>When you save (download) a picture to your phone, or share it on WhatsApp, social media or anywhere else, that
            copy is in your hands. Once a picture leaves the app, {COMPANY.name} and PottuPaarkalaam cannot control or delete
            it, and are not responsible for how it is kept, copied, changed, shared or used, by you or by anyone you share it
            with.</li>
          <li>A picture you share from the app comes with a message and your invite link. You can change or remove the
            message before sending it. Send invites only to people who would want them, not as bulk or unwanted messages.</li>
          <li>Pictures can look real. Share only pictures of yourself, or of a person who has agreed to it, and never in a
            way that misleads, embarrasses or harms anyone.</li>
          <li>Every picture is marked as made by AI: it carries a visible &ldquo;AI-generated · PottuPaarkalaam&rdquo; label
            and, inside the file, a note that it is AI-generated with its own ID, as Indian law requires (IT Rules 2021,
            rule 3(3)). Do not remove, cover or crop out the label, or present the picture as a real photo.</li>
        </ul>
      </section>

      <section>
        <h2>8. Keeping your photos safe on our side</h2>
        <ul>
          <li>While your photos and pictures are on our servers (at most 3 days), only your signed-in account can see them.
            Apart from sending them to our AI provider to make your pictures (see the Privacy Policy), we do not share,
            sell, publish or show them to anyone, and we look at them only if you ask us to (for example, for a complaint)
            or the law requires it.</li>
          <li>We are responsible for keeping your data safe, on our systems and with the providers who process it for us.
            If a personal data breach affects your data, we will tell you and the Data Protection Board of India as the law
            requires.</li>
        </ul>
      </section>

      <section>
        <h2>9. Our responsibility</h2>
        <p>
          We provide the service as it is and work to keep it running, but it may sometimes be unavailable. Apart from
          keeping your photos safe on our servers (section 8), and to the extent the law allows, our total responsibility
          to you is limited to the amount you paid us in the last three months. This limit does not apply to our duties to
          protect your personal data. These terms are governed by Indian law; courts at {COMPANY.jurisdiction} have
          jurisdiction. This does not take away your right to complain to the Consumer Commission where you live, or to
          the National Consumer Helpline (1915).
        </p>
      </section>

      <section>
        <h2>10. Complaints</h2>
        <p>
          Grievance Officer: {COMPANY.grievanceOfficer}, {COMPANY.grievanceEmail}, {COMPANY.supportPhone}. We acknowledge a complaint within
          24 hours and resolve it within 7 days. A complaint about a picture that shows a person without their consent,
          in a sexual or intimate way, or pretending to be someone (for example a morphed or deepfake picture) is acted on
          within 2 hours.
        </p>
      </section>

      <section>
        <h2>11. Changes</h2>
        <p>
          If we change these terms, the app asks you to read and agree to them again before your next try-on. It also asks
          you to read them again once a year.
        </p>
      </section>
    </>
  )
}
