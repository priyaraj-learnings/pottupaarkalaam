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
| DPDP Act 2023, s.6 (separate consent for marketing) | Offers by email only with their own tick; easy to withdraw | "Send me offers and news by email" (`accounts.email_offers_ok`, off by default, migration `20261110000100`) is separate from WhatsApp / SMS offers. The monthly "free pictures are back" email is account news about the customer's free credits, with an account-menu switch and a signed one-click unsubscribe link (List-Unsubscribe, RFC 8058) in every email (`lib/server/email.ts`). Resend listed as a processor in the Privacy Policy |
| Consumer Protection (E-Commerce) Rules 2020; fair referral terms | Clear conditions for invite rewards | Terms §4 "Invite friends": who qualifies (new account within 7 days, verified number), limit per person, once per number, may end any time; enforced in SQL (`claim_referral`, `settle_referral`) |
| DPDP Act 2023, s.6 (people in sample model photos) | Consent of the person shown | /admin Settings → Models & shops refuses a sample model without the admin ticking that the person agreed in writing (`lib/server/samples.ts`); Terms §4 limits how customers use those pictures |
| IT Rules 2021, rule 3(3), collage and notifications | AI label stays on shared pictures | The "Help me choose" collage keeps each picture's label and adds "AI-generated pictures" in its footer (`lib/client/collage.ts`); notifications carry no personal data (`lib/server/push.ts`) |
| Consumer Protection Act 2019 (no misleading statements) | What the Terms promise matches the service | Terms §4 no longer says every account gets free credits (terms version `2026-10-30.1`) |
| DPDP Act 2023, s.5 and s.8(7) (website visits) | Say what is collected; keep it no longer than needed | Visits counted without cookies or a third party (`lib/server/visits.ts`, migration `20261030000200`): a one-way code of address and browser with a daily key, kept for that day only (`purge_site_visitors`, hourly); only counts per day stay. Privacy Policy (English and Tamil), terms version `2026-10-30.2` |
| E-Commerce Rules 2020, rule 4(2) | Customer care phone number | `COMPANY.supportPhone` in Terms §1 and §10, Privacy Policy and the account menu |

## Coming into force on 13 May 2027 (DPDP Rules 2025, rules 3 and 5–16)

- Tamil consent and Privacy Policy, and in-app account deletion: done (see the table above).
- The Terms of Use are in English only; a Tamil version would help but is not required for the DPDP notice.
- **Breach reporting** to customers and the Data Protection Board, detailed report within 72 hours (rule 7):
  `docs/BREACH_RUNBOOK.md`.
- **Grievance replies** within 90 days at most (rule 14): already within 7 days.

## In force now, outside the code

| Rule | What it asks | Status |
|---|---|---|
| CERT-In Directions, 28 April 2022 (IT Act s.70B) | Report cyber security incidents to CERT-In within 6 hours | `docs/BREACH_RUNBOOK.md` |
| CERT-In Directions, 28 April 2022 | Keep ICT system logs for 180 days, within India | **Open**: set the Cloud Logging bucket retention to 180 days in asia-south1 / asia-south2 |

## Security and compliance review, 13 November 2026

Fixed in code (migration `20261113000100_security.sql`): automatic payment approval trusts only exact bank senders
set in /admin (none set: nothing auto-approved) and bank emails only with Gmail's DMARC pass; failed tries never turn
free credits into paid ones; stored photos lose their EXIF (GPS) details; unsubscribe links have their own secret;
Telegram connects only the chat that sends a one-time code; per-address limits on visit counting, mobile sign-in and
unsubscribe; bank messages lose the payer's name when the account is deleted and unmatched ones are cleared after 90
days; partner-photo and sample-model consent are recorded. Text: the consent screen names OpenAI (USA) and its 30-day
abuse copy; Terms §3 has the full IT Rules 3(1)(b) list, the penalty warning, DPDP s.15 and children; breach wording
covers providers; consumer commission / 1915 helpline; Privacy Policy adds the rights summary, nominee, response time,
"someone added my photo", Supabase in Mumbai, Gmail and Telegram, and other-language requests.

Built next (migration `20261114000100_compliance.sql`, 13 November 2026):
- Receipts: numbered receipts (PP-<year>-000001) for every approved recharge, printable from Recharge; GSTIN in
  Settings once registered (Consumer Protection Act 2019, s.2(47)(ix)).
- /admin → Safety: complaints (24 h / 7 days / 2 hours), problem reports with refunds, find a picture by its `pp-` ID,
  take down, block / unblock, 180-day evidence hold that stops the cleanup and account deletion, action log
  (IT Rules 2021, rules 3(1)(c), 3(1)(g), 3(2)).
- Deleted accounts' sign-in details kept 180 days (IT Rules 2021, rule 3(1)(h)); usage log kept 1 year
  (DPDP Rules 2025, rule 8(3)); both purged automatically.
- Itemised "how we use your personal data" notice with its own tick, recorded with its version (DPDP Rules 2025, rule 3).
- Terms of Use in Tamil (IT Rules 2021, rule 3(1)(a)).
- "Report a problem" on each picture, refund when the admin agrees (Terms §5).
- Public /complaints page with the Grievance Officer's details and ticket numbers; Telegram alerts for new complaints.
- Customer care email: pottupaar@inaivuit.com.
Still open: a script-src CSP.

## Open items for the owner

- [ ] **Breach runbook:** fill in the technical lead and backup in `docs/BREACH_RUNBOOK.md`.
- [ ] **Logs for 180 days in India** (CERT-In, above). UduthiPaar needs the same.

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
