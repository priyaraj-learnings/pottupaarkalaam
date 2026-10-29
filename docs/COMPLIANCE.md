# Compliance record (India)

What the law asks of PottuPaarkalaam and where the app does it. Last reviewed 29 October 2026.
This is an engineering record, not legal advice: have a lawyer review it before relying on it.

## In force now

| Rule | What it asks | Where |
|---|---|---|
| IT Rules 2021, rule 3(3) (2026 amendment, in force 20 Feb 2026) | AI-made pictures carry a prominent label and permanent metadata / unique identifier; no tool to remove it | `lib/server/images.ts`: visible "AI-generated · PottuPaarkalaam" label in the pixels, EXIF + XMP (IPTC `trainedAlgorithmicMedia`, ID `pp-<look id>`) on stored and saved pictures. Tested in `tests/aiLabel.test.ts` |
| IT Rules 2021, rule 3(1)(b) | Terms tell users what they must not upload or make | Terms §3 |
| IT Rules 2021, rule 3(1)(c) | Remind users of the rules at least once a year | `termsDue()` in `lib/rules.ts`: consent screen again after 365 days |
| IT Rules 2021, rule 3(2) (as amended 2026) | Grievance Officer; acknowledge in 24 h, resolve in 7 days; intimate / impersonation complaints in 2 h | Terms §10, `lib/legal.ts` |
| IT Rules 2021, rule 3(3)(a) | Reasonable measures against unlawful synthetic content | Prompts only dress people in garments; OpenAI moderation stays on (default); Terms §3 and the consent screen; partner consent for couple pictures |
| Consumer Protection (E-Commerce) Rules 2020 | Legal name, address, grievance officer, refund policy, full price before paying | Terms §1, §4, §5, §10; Recharge screen ("full prices: nothing is added") |
| Dark Patterns Guidelines 2023 | No false urgency, hidden charges, forced sign-ups | Prices and bulk saving are computed from Settings; couple price shown before making |
| RBI Master Directions on PPIs | Credits usable only for the firm's own service are a closed system, not an RBI-regulated wallet | Terms §4: credits cannot be transferred, sold or cashed out |
| DPDP Act 2023 (Board, breach basics) | Notice of what is collected and why; security; breach reporting | Privacy Policy; photos private and deleted after 3 days |

## Coming into force on 13 May 2027 (DPDP Rules 2025, rules 3 and 5–16)

- **Notice in Indian languages** (Act s.5(3)): the consent screen and Privacy Policy must be available in English or a
  language of the Eighth Schedule on request. Add a Tamil version (have it checked by a native speaker).
- **Withdraw consent as easily as giving it** (Act s.6(4)) and **erasure** (s.12): add "Delete my account" in the
  account menu. It should delete the photos and the sign-in, and keep only the payment records tax law requires.
  Today this is done by email to the privacy address.
- **Breach reporting** within 72 hours to the Data Protection Board (rule 7): keep a short runbook.
- **Grievance replies** within 90 days at most (rule 14): already within 7 days.

## Operational (outside the code)

- **Offers on SMS or WhatsApp** need TRAI DLT registration (header and templates) or WhatsApp Business opt-in. The
  app records consent (`offers_ok`, `offers_ok_at`). Send nothing promotional until that is in place.
- **Customer care phone number**: the E-Commerce Rules ask for one. Add it to `lib/legal.ts` (and the Terms) once chosen.
- **GST**: if the firm becomes GST-registered, prices stay "full prices" (tax included) and invoices are needed for
  B2B buyers.
