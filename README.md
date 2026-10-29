# PottuPaarkalaam (போட்டுப்பார்க்கலாம்)

**pp.inaivuit.com**: a consumer virtual try-on app by inaivu IT. Anyone signs in on their phone, photographs up to
5 unstitched fabrics or stitched dresses, adds their own photo and sees themselves wearing them. Pictures are made
with OpenAI's image model (the same model and garment rules as UduthiPaar), can be saved to the gallery or shared,
and are deleted after 3 days.

- **App:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4. Mobile-first and installable
  ("Add to Home screen"), no app store needed.
- **Data / sign-in / photos:** its own Supabase project (Postgres, Auth with Google and email code, private Storage).
- **AI:** OpenAI Images API (`gpt-image-2.5-flare`, quality `low`, 1024×1536).
- **Background pictures:** Google Cloud Tasks → `/api/internal/make-look` (in-process after the reply when running locally).
- **Hosting:** Google Cloud Run (asia-south1) behind Firebase Hosting for the domain.

Setting it up for the first time: **[docs/SETUP.md](docs/SETUP.md)**. Cheaper try-on models researched:
[docs/TRY-ON-MODELS.md](docs/TRY-ON-MODELS.md).

> Next.js in this repository is newer than most references. Read the guides in
> `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

## How it works

| Customer | What happens |
| --- | --- |
| Signs in | Google (one tap with the account on the phone) or a 6-digit code by email. Agrees to the terms once. |
| Try on | Picks a category (saree, kurti, lehenga, shirt, pant…) and *unstitched fabric* or *stitched dress*, adds up to 5 clothes photos and their own photo. Two clothes can be **paired** into one picture (shirt + pant, kurti + bottom, saree + blouse, lehenga + blouse, Nehru jacket or coat over a kurta or shirt). |
| Credits | 1 picture of one garment = 1 credit; a pair = 2 credits. Free credits every month (3 by default, set in /admin; used first, not carried over). Credits are taken when the picture is queued and given back automatically if it fails. |
| Recharge | Pays inaivu IT by UPI (button opens the UPI app; QR for another phone), then enters the 12-digit UPI reference (UTR). Below ₹1,000: ₹8 a credit; ₹1,000 or more: ₹5 a credit (both set in /admin). Paid credits never expire. |
| Verification | Automatic when the bank's credit SMS (forwarded to `/api/payments/notify`) has the same UTR and amount; otherwise an admin approves it in `/admin`. A UTR is credited only once. |
| My pictures | The last 3 days, with Save (to gallery) and Share. "Delete all my photos now" removes everything at once. |

Admins (`/admin`, people listed in `app_admins`) get four tabs:

| Tab | What it shows |
| --- | --- |
| Overview | For this month, last month, the last 7 / 30 days or all time: **earned** (money received minus AI cost), money received, AI cost (from OpenAI's token counts and the AI prices in Settings, per picture and on free credits), the value of credits used, credits still owed to customers, a money-received-vs-AI-cost chart per day (or month), customers (new, active, paying), pictures (pairs, failed) and what people try on |
| Customers | Every customer with their mobile number (if given), what they paid, their AI cost and what you earned from them, pictures and credits left; search by email, name or mobile, sort, CSV export (with who agreed to offers); one customer's Call / WhatsApp links, recharges, pictures and credit history, and give or take back credits |
| Payments | Recharges to check (with what the bank alert said), bank credits nobody claimed, all payments for a period with CSV export |
| Settings | UPI ID and payee (the customer's QR and pay button), help contact, prices and free credits, AI prices, give credits |

## Getting started (developers)

```bash
npm ci
cp .env.example .env.local   # fill in a Supabase project and an OpenAI key
npm run dev
```

Apply `supabase/migrations/` to the Supabase project first (`supabase db push`, docs/SETUP.md §1).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Next.js route types, then `tsc --noEmit` |
| `npm test` | Vitest: rules, prompts, bank SMS reading, and the SQL credit/recharge functions on an in-memory Postgres (PGlite) |
| `npm run icons` | Remake the app icons and link preview from `public/logo.svg` |

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Also Docker build arguments (built into the browser code) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only |
| `OPENAI_API_KEY` | yes | |
| `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY` | no | Default `gpt-image-2.5-flare`, `low`. Higher quality costs more than the ₹5 bulk price |
| `CRON_SECRET` | yes | Bearer secret for `/api/cron/cleanup` (hourly) |
| `PAYMENT_WEBHOOK_SECRET` | for automatic verification | Bearer secret for `/api/payments/notify` |
| `PAYMENT_SMS_SENDERS` | no | Bank SMS sender IDs allowed to confirm payments, e.g. `HDFCBK,ICICIT` |
| `JOB_DISPATCH`, `GOOGLE_CLOUD_PROJECT`, `TASKS_LOCATION`, `TASKS_QUEUE`, `TASK_SERVICE_ACCOUNT`, `WORKER_URL` | UAT / production | `JOB_DISPATCH=CLOUD_TASKS` and the queue; without them pictures are made in-process |
| `NEXT_PUBLIC_APP_ENV` | no | `uat` on UAT (no search indexing) |

## Code map

| Path | What |
| --- | --- |
| `app/page.tsx`, `components/PottuApp.tsx` | The app: sign-in, consent, tabs (Try on, My pictures, Recharge) |
| `components/TryOn.tsx`, `LookCard.tsx`, `History.tsx`, `Recharge.tsx` | The screens |
| `app/admin/page.tsx` | Admin console |
| `app/api/**` | API routes (all take the Supabase access token as `Authorization: Bearer`) |
| `lib/rules.ts` | Categories, pairs, looks and credits, recharge prices (shared by screens and server) |
| `lib/garments.ts`, `lib/prompts.ts` | Garment rules (copied from UduthiPaar) and the image instructions |
| `lib/server/looks.ts` | Upload, charge, queue, make, refund, history, 3-day cleanup |
| `lib/server/openaiImage.ts` | OpenAI call, token usage and cost estimate |
| `lib/bankAlert.ts`, `lib/server/paymentAlerts.ts` | Reading bank credit SMS, the payment webhook |
| `supabase/migrations/` | Tables and the SQL functions that change credits (one transaction each, row-locked, with a ledger) |

## Security notes

- The browser uses Supabase only to sign in. Every table and function is server-only (`service_role`);
  `anon` and `authenticated` have no access (tested in `tests/database.test.ts`).
- Photos are in a private bucket and shown through 1-hour signed links; downloads check the owner.
- Credits change only inside SQL functions with a row lock on the account, so two requests cannot spend the same
  credit, a look is charged once and refunded at most once, and a UTR is credited once.
- Webhook, cron and Cloud Tasks worker endpoints require their own secrets / Google-signed tokens.

## Releasing

Same process as UduthiPaar (see `CLAUDE.md`): changes are merged into `uat` and tested there after the owner approves
the UAT build; only then is a pull request squash-merged into `main`, which deploys production.
Migrations go to the UAT database first, then production, before the code that needs them.
