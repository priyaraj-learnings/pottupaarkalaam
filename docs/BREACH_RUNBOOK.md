# Personal data breach runbook

What to do if customers' photos, AI pictures, mobile numbers, emails or payment records may have been seen,
copied, changed, lost or deleted by someone who should not have. Keep this short enough to follow under pressure.
This is an engineering runbook, not legal advice: have a lawyer review it, and call one early in a real incident.

For PottuPaarkalaam, inaivu IT is the data fiduciary: we tell customers ourselves. (UduthiPaar has its own
runbook, where the shops tell their customers.)

## Who

| Role | Person | Contact |
|---|---|---|
| Incident lead (decides, keeps the log) | Priyaraja Asokan (Grievance Officer) | grievance@inaivuit.com, +91 96777 57237 |
| Technical lead (contains and investigates) | _fill in_ | _fill in_ |
| Backup for both | _fill in_ | _fill in_ |

## The clocks (start when we first become aware)

| Deadline | Who to tell | Rule |
|---|---|---|
| **6 hours** | CERT-In: incident@cert-in.org.in, phone 1800-11-4949 (form on cert-in.org.in) | CERT-In Directions, 28 April 2022 (IT Act s.70B): report cyber security incidents, including data breaches and unauthorised access |
| **Without delay** | Each affected customer: by email (Google or email sign-in) or SMS / call (mobile sign-in or verified number), in plain words: what happened, what data, what we did, what they can do, who to contact | DPDP Rules 2025, rule 7(1) (from 13 May 2027); Terms §8 and the Privacy Policy already promise it |
| **Without delay** | Data Protection Board of India: short intimation through its online portal | DPDP Rules 2025, rule 7(2)(a) (from 13 May 2027) |
| **72 hours** | Data Protection Board: detailed report (what happened, data, people affected, cause, steps taken, who to contact) | DPDP Rules 2025, rule 7(2)(b) |

## Steps

1. **Start a log** (time-stamped notes in one place): who noticed what, when, and every action taken after.
2. **Contain** (technical lead, first hour):
   - Rotate exposed secrets (Google Cloud Secret Manager): `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
     `CRON_SECRET`, `PAYMENT_WEBHOOK_SECRET` (then update `PP_SECRET` in the Gmail forwarder script), and the
     MSG91 auth key in /admin Settings.
   - Revoke sessions of affected users (Supabase Auth), remove a compromised admin from `app_admins`.
   - If storage was exposed, make sure the `try-on-photos` bucket is private and signed links have expired; take a
     broken feature offline rather than leave it open.
3. **Preserve evidence**: export Cloud Run / Cloud Logging logs and Supabase logs for the period before they roll
   over. Do not delete records that show what happened. Photos are deleted after 3 days by design: note which
   ones existed at the time from the `looks` and `try_on_batches` rows.
4. **Assess** (within 6 hours): what data (photos, AI pictures, partner photos, names, emails, mobile numbers,
   UPI references), how many customers, whether it was actually accessed or only exposed, and whether it is ongoing.
5. **Report** on the clocks above. Say what is not known yet; send an update when it is.
6. **Fix the cause**, then check it cannot happen again (test, review, monitoring).
7. **Close**: within 2 weeks write a short report (timeline, cause, impact, fixes) and keep it with the log.

## Keep ready

- This file up to date with names and phone numbers.
- System logs kept **180 days, in India** (CERT-In Directions 2022): set the Cloud Logging bucket retention to 180
  days in an Indian region (asia-south1 or asia-south2).
- A test once a year: walk through this runbook with a made-up incident.
