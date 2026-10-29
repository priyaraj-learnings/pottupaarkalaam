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
          you agree to these terms.
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
          <li>Do not add nude, sexual, violent or hateful photos, or photos meant to embarrass, deceive or impersonate anyone.</li>
          <li>Add photos of clothes you have the right to use.</li>
          <li>We may block an account that breaks these rules, without refund of unused credits.</li>
        </ul>
      </section>

      <section>
        <h2>4. Credits, prices and recharges</h2>
        <ul>
          <li>Every account gets free credits each calendar month (shown in the app). Unused free credits do not carry over.</li>
          <li>Free credits may need a mobile number verified by an SMS code. One mobile number can belong to one account only,
            so free credits go to one number a month. Making extra accounts to get more free credits is not allowed.</li>
          <li>One garment makes one picture for 1 credit. Two garments worn together (a pair) make one picture for 2 credits.</li>
          <li>You buy credits by paying {COMPANY.name} by UPI and entering the UPI reference (UTR). The price per credit
            depends on the recharge amount, as shown in the app before you pay. Credits are added when the payment is
            confirmed, usually within a few hours.</li>
          <li>Paid credits do not expire while the service runs.</li>
          <li>If a picture cannot be made, its credits are returned automatically.</li>
        </ul>
      </section>

      <section>
        <h2>5. Refunds</h2>
        <ul>
          <li>Credits used for a picture that was made are not refunded.</li>
          <li>If you paid twice, paid the wrong amount, or paid but no credits were added, write to {COMPANY.supportEmail}{' '}
            with your UPI reference. We refund the money to the account it came from within 7 working days of confirming it.</li>
          <li>Unused paid credits are refunded on request if we close the service.</li>
        </ul>
      </section>

      <section>
        <h2>6. Your photos</h2>
        <p>
          Your photos and pictures are deleted 3 days after you add them, or earlier if you tap
          {' '}&ldquo;Delete all my photos now&rdquo;. Save the pictures you want to keep. See the Privacy Policy for details.
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
          <li>Pictures can look real. Share only pictures of yourself, or of a person who has agreed to it, and never in a
            way that misleads, embarrasses or harms anyone.</li>
        </ul>
      </section>

      <section>
        <h2>8. Keeping your photos safe on our side</h2>
        <ul>
          <li>While your photos and pictures are on our servers (at most 3 days), only your signed-in account can see them.
            Apart from sending them to our AI provider to make your pictures (see the Privacy Policy), we do not share,
            sell, publish or show them to anyone, and we look at them only if you ask us to (for example, for a complaint)
            or the law requires it.</li>
          <li>Our responsibility for your photos is to keep them safe on our servers. If they are ever exposed because our
            systems were broken into, or shared from our servers by us, we will tell you and the Data Protection Board of
            India and do what the law requires of us.</li>
        </ul>
      </section>

      <section>
        <h2>9. Our responsibility</h2>
        <p>
          We provide the service as it is and work to keep it running, but it may sometimes be unavailable. Apart from
          keeping your photos safe on our servers (section 8), and to the extent the law allows, our total responsibility
          to you is limited to the amount you paid us in the last three months. These terms are governed by Indian law;
          courts at {COMPANY.jurisdiction} have jurisdiction.
        </p>
      </section>

      <section>
        <h2>10. Complaints</h2>
        <p>
          Grievance Officer: {COMPANY.grievanceOfficer}, {COMPANY.grievanceEmail}. We acknowledge a complaint within
          24 hours and resolve it within 15 days. A request to remove a picture of a person made without their consent
          is acted on within 24 hours.
        </p>
      </section>

      <section>
        <h2>11. Changes</h2>
        <p>If we change these terms, the app asks you to read and agree to them again before your next try-on.</p>
      </section>
    </>
  )
}
