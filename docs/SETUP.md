# Setting up PottuPaarkalaam (owner's guide)

Everything needed to take PottuPaarkalaam live at **https://pp.inaivuit.com**, in order. UAT first, then production.
Each environment has its own Supabase project and its own Google Cloud project, like KanakkuPaar.

| Step | UAT | Production |
| --- | --- | --- |
| Supabase project | `pottupaarkalaam-uat` | `pottupaarkalaam-production` |
| Google Cloud project | `pottupaarkalaam-uat` | `pottupaarkalaam-production` |
| Cloud Run service | `pottupaarkalaam-uat` | `pottupaarkalaam` |
| Git branch that deploys | `uat` (after you approve the build) | `main` |
| Address | the service's `https://pottupaarkalaam-uat-….run.app` | `https://pp.inaivuit.com` (Firebase Hosting) |

---

## 1. Supabase (database, sign-in, photos)

1. https://supabase.com/dashboard → **New project** → name `pottupaarkalaam-uat`, region **South Asia (Mumbai)**,
   a strong database password (keep it in your password manager). Use the **Pro** plan for production so it never pauses.
2. Apply the tables: Supabase → **SQL Editor** → **New query** → paste each file from `supabase/migrations/`
   in name order (oldest first) → **Run** ("Success. No rows returned"). Or, from a laptop with the Supabase CLI:
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
   This creates the tables, the credit and report functions and the private `try-on-photos` bucket. A later release
   that adds a migration file says so; run the new file the same way, on UAT first, **before** approving that build.
3. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key
   (the service_role key is secret; it goes into Google Secret Manager in §3, never into code).

### 1.1 Sign-in with Google (the main button)

1. Google Cloud Console (the Google Cloud project from §3) → **APIs & Services → OAuth consent screen**:
   app name **PottuPaarkalaam**, the logo (`public/icons/icon-512.png`), support email, authorised domain
   `inaivuit.com`, scopes *email* and *profile* only. Set **Publishing status: In production** (otherwise only test
   users can sign in).
2. **Credentials → Create credentials → OAuth client ID → Web application**. Authorised redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. Copy the client ID and secret.
3. Supabase → **Authentication → Sign In / Providers → Google**: turn on, paste the client ID and secret.
4. Supabase → **Authentication → URL Configuration**: Site URL `https://pp.inaivuit.com` (UAT: its run.app address);
   add the same address with `/**` under **Redirect URLs**.

On Android the Google button shows the account already on the phone, so signing in is one tap; people then stay
signed in.

### 1.2 Sign-in with an email code (for people without Google)

1. Supabase → **Authentication → Emails → SMTP Settings**: connect a real mail service (e.g. the Resend or Gmail
   account used for inaivu IT mail). Supabase's built-in mail only reaches your own team, so customers would get
   nothing without this.
2. **Authentication → Emails → Templates → Magic Link**: make sure the email shows the code, e.g.
   `Your PottuPaarkalaam sign-in code is {{ .Token }}`.
3. **Authentication → Sign In / Providers → Email**: keep **Confirm email** on, and turn **off** sign-up with
   password if offered (the app never uses passwords).

### 1.3 Sign-in with a mobile number (MSG91 OTP widget)

Optional; for people who don't use Google or email. MSG91 sends and checks the code with its OTP widget (the same
MSG91 account as salemtamilroots.in works; without your own DLT registration MSG91 uses its own sender).

1. Run `supabase/migrations/20261029000300_phone_login.sql` and `20261029000400_mobile_required.sql` (UAT first,
   then production).
2. MSG91 → **OTP → Widgets**: create a widget for PottuPaarkalaam (a separate one from salemtamilroots.in, so the
   messages and settings stay apart), with India allowed. Turn **Demo Credentials** off once testing is done:
   anyone who knows the demo number and code could sign in as that number without an SMS.
3. `/admin` → **Settings** → *Mobile number sign-in (MSG91)*: enter the **Widget ID**, the widget **token**
   (tokenAuth) and the account's **Auth key** (MSG91 → Authkey; secret: it is saved but never shown again) →
   **Save settings**. "Sign in with mobile number" then appears on the sign-in screen; clear the Widget ID to
   turn it off.
4. Optional, once a test sign-in works: tick **Free credits only for a verified mobile number**. Everyone who
   signs in with Google or email must then verify a number with an SMS code before using the app; a verified number
   belongs to one account only, so free credits go to one number a month.

People who sign in this way get a stand-in email address in Supabase (`pp-phone-<number>@inaivuit.com`); the app
never emails it and shows their mobile number instead.

### 1.4 Couple pictures (optional, paid)

One picture of two people, him and her, each in their own new garment: a **Couple** tab between *Try on* and
*My pictures*.

1. Run `supabase/migrations/20261029000500_couple_pictures.sql` (UAT first, then production).
2. `/admin` → **Settings** → *Couple pictures*: tick **Offer couple pictures**, set **Credits per couple picture**
   (3 by default: ₹24 at ₹8 a credit) → **Save settings**.
3. Each customer then sees **Couple pictures** in their account menu; turning it on adds the Couple tab. A couple
   picture uses paid credits only (never the free ones), the customer confirms that both people agreed, and the
   credits come back if the picture fails. Untick *Offer couple pictures* to hide the tab from everyone.

### 1.4 Make yourself an admin

Sign in to the app once, then in Supabase → **SQL Editor**:

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'pr@inaivuit.com';
```

`/admin` (and an *Admin* link in the account menu) now works for you.

---

## 2. OpenAI

1. https://platform.openai.com → **API keys** → create a key for the project (one for UAT, one for production).
2. **Settings → Organization → Limits**: set a monthly budget and an email alert.
3. The model and quality are set in the deploy files (`gpt-image-2.5-flare`, `low`). At `low`, a picture with one or
   two garments costs roughly ₹2.6–4 (see [TRY-ON-MODELS.md](TRY-ON-MODELS.md)); `/admin` shows the estimate from
   the real token counts. Check the rates in `lib/server/openaiImage.ts` against https://openai.com/api/pricing.

---

## 3. Google Cloud (UAT, then production)

Run in Cloud Shell. The first line names the project; use `pottupaarkalaam-production` for production:

```bash
PROJECT=pottupaarkalaam-uat
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudtasks.googleapis.com cloudscheduler.googleapis.com

# Where the app's images are kept.
gcloud artifacts repositories create pottupaarkalaam --repository-format=docker --location=asia-south1

# The identity the app runs as. It may read its secrets, queue tasks, and sign the tasks' tokens.
gcloud iam service-accounts create pp-runner --display-name="PottuPaarkalaam runner"
SA=pp-runner@$PROJECT.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/cloudtasks.enqueuer
gcloud iam service-accounts add-iam-policy-binding $SA --member=serviceAccount:$SA --role=roles/iam.serviceAccountUser
gcloud iam service-accounts add-iam-policy-binding $SA --member=serviceAccount:$SA --role=roles/iam.serviceAccountTokenCreator

# The queue the pictures go through (a retry only re-checks: a picture is never made twice).
gcloud tasks queues create pp-looks --location=asia-south1 \
  --max-concurrent-dispatches=20 --max-attempts=2 --min-backoff=10s

# Two random secrets (finish on their own; nothing to type).
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create CRON_SECRET --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create PAYMENT_WEBHOOK_SECRET --data-file=-
```

Add the two keys you copy in the web console (no terminal typing, so no stray line breaks):
Google Cloud Console → **Secret Manager** → **+ Create secret**, once for each, leaving the other options as they are:

| Name | Secret value |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → **API Keys** → the **service_role** key (starts with `eyJ`; it may be on a "Legacy API keys" tab). If only new-style keys are shown, the **secret** key (starts with `sb_secret_`). |
| `OPENAI_API_KEY` | the OpenAI key (starts with `sk-`) |

`gcloud secrets list` then shows all four. To see a random one later (for §5 and §6):
`gcloud secrets versions access latest --secret=PAYMENT_WEBHOOK_SECRET`

### 3.1 Build triggers (as UduthiPaar)

**a. An identity for the builds.** In Cloud Shell:

```bash
PROJECT=pottupaarkalaam-uat   # or pottupaarkalaam-production; a new Cloud Shell may still point at the other one
gcloud config set project $PROJECT
gcloud iam service-accounts create pp-builder --display-name="PottuPaarkalaam builds"
BUILDER=pp-builder@$PROJECT.iam.gserviceaccount.com
for role in roles/run.admin roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$BUILDER --role=$role --condition=None
done
gcloud iam service-accounts add-iam-policy-binding pp-runner@$PROJECT.iam.gserviceaccount.com \
  --member=serviceAccount:$BUILDER --role=roles/iam.serviceAccountUser

# Check: serviceAccountUser lists pp-builder and pp-runner; serviceAccountTokenCreator lists pp-runner.
gcloud iam service-accounts get-iam-policy pp-runner@$PROJECT.iam.gserviceaccount.com
# Both pp-builder and pp-runner of this project should be listed. If the trigger's
# Service account list misses pp-builder, this block ran in the other project: run it again.
gcloud iam service-accounts list
```

**b. Connect the repository.** Cloud Build → **Triggers** → **Connect repository** → GitHub (Cloud Build GitHub App)
→ sign in to GitHub → install the **Google Cloud Build** app on the **priyaraj-learnings** account (only the
`pottupaarkalaam` repository is enough) → choose `priyaraj-learnings/pottupaarkalaam` → **Connect**.

**c. Create the trigger.** Cloud Build → **Triggers → Create trigger**:

| | UAT | Production |
| --- | --- | --- |
| Name | `pottupaarkalaam-uat` | `pottupaarkalaam-production` |
| Event | Push to a branch | Push to a branch |
| Repository / branch | `priyaraj-learnings/pottupaarkalaam`, `^uat$` | same, `^main$` |
| Configuration | Cloud Build configuration file, `cloudbuild.uat.yaml` | `cloudbuild.yaml` |
| Substitution variables | `_SUPABASE_URL` = the Supabase Project URL; `_SUPABASE_ANON_KEY` = the **anon** key (or the new **publishable** key, `sb_publishable_…`); `_WORKER_URL` = empty for now; `_PAYMENT_SMS_SENDERS` = empty for now | same, with the production project's values |
| Approval | tick **Require approval before build executes** | not ticked (only reviewed merges reach `main`) |
| Service account | `pp-builder@…` | same |

**d. Run it.** Triggers list → the UAT trigger → **Run** → branch `uat` → **Run trigger**. Then Cloud Build →
**History**: the build shows *Awaiting approval* → open it → **Approve**. It takes about 5 to 8 minutes. Later
builds start by themselves when `uat` changes and wait for your approval the same way.

**e. First deploy only.** When the build is green, open Cloud Run → `pottupaarkalaam-uat` and copy its URL
(`https://pottupaarkalaam-uat-….asia-south1.run.app`):
1. Edit the trigger: set `_WORKER_URL` to that URL → **Save** → **Run** again and approve. Until then pictures do
   not start (customers get their credits back automatically).
2. Supabase → **Authentication → URL Configuration**: Site URL = that URL; add `<that URL>/**` under Redirect URLs.

Check: `<that URL>/api/health` answers `{"ok":true,…}`. If a build fails, open it in **History**; the red step
shows why.

---

## 4. The address pp.inaivuit.com (production only)

Cloud Run cannot take a custom domain in Mumbai, so Firebase Hosting carries it (exactly as KanakkuPaar).

1. `npx -y firebase-tools@14 login`, then from the repository: `npx -y firebase-tools@14 deploy --only hosting --project pottupaarkalaam-production`.
2. Firebase console → **Hosting → Add custom domain** → `pp.inaivuit.com`.
3. Hostinger → **Domains → inaivuit.com → DNS records**: add the records Firebase shows with the name **`pp`**
   (Hostinger adds `.inaivuit.com` itself). Delete any other `A`/`AAAA`/`CNAME` record named `pp`.
4. Wait for **Connected** (minutes to an hour; the certificate up to 24 hours).
5. Add `https://pp.inaivuit.com/**` to Supabase **Redirect URLs** (§1.1) if not done already.

Firebase Hosting ends a request after 60 seconds; that is why pictures are made through Cloud Tasks, which calls the
service's own address directly.

Firebase Hosting also keeps a copy of pages it may cache. The app marks its pages `no-cache`, so a new release shows
straight away. If pp.inaivuit.com ever shows older screens than the service's own run.app address, clear that copy
by running step 1 again (it publishes the same Hosting settings, which empties Firebase's cache).

---

## 5. Hourly cleanup (photos are deleted after 3 days)

```bash
gcloud scheduler jobs create http pp-cleanup --location=asia-south1 --schedule="17 * * * *" \
  --uri="https://<service address>/api/cron/cleanup" --http-method=POST \
  --headers="Authorization=Bearer <CRON_SECRET>"
```

It deletes photos and pictures older than 3 days and refunds any picture that never finished. (History never shows
anything older than 3 days, even between runs.)

---

## 6. UPI recharges

### 6.1 Payee

`/admin` → **Settings** tab: inaivu IT's **business** UPI ID and payee name, the help contact customers see, and the prices
(suggested: 3 free credits a month; ₹8 a credit, ₹5 a credit from a ₹1,000 recharge; recharges from ₹40 to ₹10,000. The
smallest recharge must be a multiple of the price per credit, so every recharge buys whole credits).

Use a business / merchant UPI ID (from the bank's merchant QR, PhonePe Business, Paytm Business or similar).
Many incoming payments to a personal UPI ID can get the account flagged, and some UPI apps refuse pay links to
personal IDs. Make a ₹50 test recharge from your own phone after any change.

### 6.2 Approving by hand

`/admin` → **Recharges to check**. Each shows the amount, the UTR the customer entered and, if the bank's SMS for that
UTR has arrived, what it said (green: matches; red: a different amount). Check your bank app for the UTR, then
**Approve** or **Reject** with a reason. Do it the same day; customers see "Checking" until then.

### 6.3 Automatic verification (recommended)

Recharges are approved within a minute when the bank's credit alert reaches the app. There are two ways; use either
or both (an alert that arrives twice is recorded once).

**Way 1 (recommended): bank alert emails, through Gmail.** Banks email every UPI credit, while many send no SMS for
small ones (HDFC Bank, for example, only texts for UPI credits from Rs 500). No phone is needed.

1. Make sure the bank emails you for every UPI credit (bank app or net banking → alerts), to a Gmail address.
2. In `/admin` → **Settings** → *Automatic payment check* → *Way 1*, press **Copy script**.
3. Signed in to that Gmail, open [script.google.com](https://script.google.com) → **New project**, replace the code
   with the script, and change `BANK_EMAIL` to the address the bank's alert emails come from (open one alert email
   to see it, e.g. `alerts@hdfcbank.net`).
4. **Project Settings** (gear) → **Script properties** → add `PP_SECRET` = the `PAYMENT_WEBHOOK_SECRET` value
   (Google Cloud → Secret Manager → PAYMENT_WEBHOOK_SECRET → latest version → *View secret value*).
5. Select `forwardBankAlerts` → **Run**, and allow access to Gmail.
6. **Triggers** (clock) → **Add trigger** → `forwardBankAlerts`, *Time-driven*, *Minutes timer*, *Every minute* →
   **Save**.

**Way 2: bank SMS, from an Android phone.**

1. Use an Android phone that receives the SMS of the bank account behind the UPI ID (a spare phone with that SIM is
   best). Keep it charged and online.
2. Install an SMS-forwarding app that can send each incoming SMS to a web address as JSON with a custom header. For
   example, the open-source *SMS to URL Forwarder* (F-Droid / GitHub) or any similar app.
3. Set it to forward only SMS from your bank's sender ID (e.g. `HDFCBK`) to:
   - URL: `https://pp.inaivuit.com/api/payments/notify`
   - Method: `POST`, body JSON `{"from": "<sender>", "text": "<message>"}` (the app's placeholders, e.g. `%from%`, `%text%`)
   - Header: `Authorization: Bearer <PAYMENT_WEBHOOK_SECRET>`
4. In Android settings, turn **battery optimisation off** for that app so it is not stopped in the background.

Either way, set the Cloud Build substitution `_PAYMENT_SMS_SENDERS` to the bank's SMS sender ID and/or alert email
domain (e.g. `HDFCBK,HDFCBANK.NET`) so alerts from anyone else are ignored, and redeploy. `/admin` → Settings shows
when the last bank alert was read.

Test it (replace the secret; use a made-up UTR):

```bash
curl -X POST https://pp.inaivuit.com/api/payments/notify \
  -H "Authorization: Bearer <PAYMENT_WEBHOOK_SECRET>" -H "Content-Type: application/json" \
  -d '{"from":"VM-HDFCBK","text":"Rs.50.00 credited to HDFC Bank A/c XX1234 from VPA test@ybl (UPI 600000000001)"}'
```

It answers `{"outcome":"STORED"}`; `/admin` lists it under *Bank credits nobody has claimed*. Then recharge ₹50 in the
app with UTR `600000000001`: it is approved at once.

How it stays safe: only requests with the secret are read; only messages that clearly say *credited / received*
with a 12-digit UTR and an amount count; the customer's UTR **and** amount must both match; each UTR is credited once;
anything unclear waits for you in §6.2.

Later, with more volume, a payment gateway (Razorpay, Cashfree, PhonePe PG) can replace this. The credit functions
stay the same; the gateway's webhook would approve the recharge instead of the SMS.

---

## 7. Before announcing it

- [ ] UAT: sign in with Google and with an email code on an Android phone and an iPhone.
- [ ] Try on: a saree from fabric, a kurti from a stitched dress, a shirt + pant pair, a saree + blouse pair.
- [ ] Save to gallery (Android: Gallery → Downloads; iPhone: Save Image) and Share to WhatsApp.
- [ ] Recharge ₹50 by hand approval, and ₹50 with automatic verification.
- [ ] A failed picture returns its credits (e.g. try a photo of a wall as "your photo").
- [ ] "Delete all my photos now" empties My pictures.
- [ ] Add to Home screen: the PottuPaarkalaam icon opens full screen.
- [ ] Read `/terms` and `/privacy`; have them checked (prices, refunds, GST) before launch.
- [ ] OpenAI monthly budget and Google Cloud budget alerts are set.
