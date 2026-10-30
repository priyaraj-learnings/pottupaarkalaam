# Compliance record (India)

What the law asks of PottuPaarkalaam and where the app does it. Last reviewed 30 October 2026.
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
| DPDP Act 2023, s.5(3) | Notice in English or a language of the Eighth Schedule | Consent screen and Privacy Policy in English or Tamil (`CONSENT_SCREEN`, `PrivacyContentTa.tsx`); switch remembered per phone. Have a native speaker review the Tamil |
| DPDP Act 2023, s.6(4) and s.12 | Withdraw consent as easily as giving it; erasure | Account menu → Delete my account (`lib/server/deleteAccount.ts`, migration `20261029000600`): photos, account, credits, mobile number and sign-in deleted; recharges kept without the person; a one-way code of a verified number kept to month end to stop repeat free credits |
| DPDP Act 2023, s.5 and s.6 (notice matches the purpose) | Say why the mobile number is collected and what is kept | Free credits only with a number verified by SMS code (migration `20261030000100`): Terms §4 and the Privacy Policy (English and Tamil) say so, give the purpose (one set of free credits per number a month) and the one-way code kept to month end after deleting the account or changing the number. Google or email accounts can use paid credits without a number, so giving it stays a choice |
| Consumer Protection Act 2019 (no misleading statements) | What the Terms promise matches the service | Terms §4 no longer says every account gets free credits (terms version `2026-10-30.1`) |
| E-Commerce Rules 2020, rule 4(2) | Customer care phone number | `COMPANY.supportPhone` in Terms §1 and §10, Privacy Policy and the account menu |

## Coming into force on 13 May 2027 (DPDP Rules 2025, rules 3 and 5–16)

- Tamil consent and Privacy Policy, and in-app account deletion: done (see the table above).
- The Terms of Use are in English only; a Tamil version would help but is not required for the DPDP notice.
- **Breach reporting** within 72 hours to the Data Protection Board (rule 7): keep a short runbook.
- **Grievance replies** within 90 days at most (rule 14): already within 7 days.

## Open items for the owner

- [ ] **Tamil review:** have a native Tamil speaker read the consent screen (`CONSENT_SCREEN.ta` and
  `CONSENT_POINTS_TA` in `lib/legal.ts`) and the Tamil Privacy Policy (`components/legal/PrivacyContentTa.tsx`).
  Any wording change there needs a new `TERMS_VERSION` (see CLAUDE.md).
- [ ] **Google Pay for Business verification** (video): then try the pay-buttons switch in /admin Settings.

## Operational (outside the code)

- **SMS codes (OTP)** are sent by MSG91 for sign-in and number checks. Confirm with MSG91 that the sender ID
  and OTP template are registered on DLT (TRAI TCCCPR 2018); unregistered SMS are blocked by operators.
- **Offers on SMS or WhatsApp** need TRAI DLT registration (header and templates) or WhatsApp Business opt-in. The
  app records consent (`offers_ok`, `offers_ok_at`). Send nothing promotional until that is in place.
- **GST**: if the firm becomes GST-registered, prices stay "full prices" (tax included) and invoices are needed for
  B2B buyers.
