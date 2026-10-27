-- PottuPaarkalaam (pp.inaivuit.com): anyone signs in on their phone,
-- photographs up to 5 fabrics or stitched dresses, adds their own photo and
-- gets try-on pictures.
--
-- Money is kept as whole try-on credits, never rupees:
-- * every account gets free credits each calendar month (India time), used
--   first and not carried over;
-- * a UPI recharge becomes paid credits at that recharge's rate (below the
--   bulk amount: the standard rate, e.g. Rs 10 a credit; at or above it: the
--   bulk rate, e.g. Rs 5 a credit). Paid credits never expire;
-- * a single garment costs 1 credit, a pair (two garments in one picture) 2.
--   Credits are taken when the try-on is queued and given back if it fails.
--
-- Recharges are paid by UPI to inaivu IT's UPI ID and verified like
-- KanakkuPaar's: the customer enters the 12-digit UPI reference (UTR). They
-- are approved automatically when the bank's credit alert (forwarded to
-- /api/payments/notify) carries the same UTR and amount, otherwise by an
-- admin. A UTR can be credited only once.
--
-- Photos and try-on pictures are deleted after 3 days (rows are kept, without
-- pictures, for the credit history).
--
-- Apply to the UAT database first, then production, BEFORE deploying the code
-- that uses it. Only the server (service_role) reads or writes these tables;
-- the browser talks to Supabase for sign-in only.

-- ---------------------------------------------------------------------------
-- Admins: people who can open /admin. Add one after they have signed in once:
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'pr@inaivuit.com';
-- ---------------------------------------------------------------------------
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Settings (one row, edited in /admin)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id boolean primary key default true,
  upi_id text,
  payee_name text,
  free_credits_per_month integer not null default 5,
  standard_rate_inr integer not null default 10,
  bulk_rate_inr integer not null default 5,
  bulk_min_recharge_inr integer not null default 1000,
  min_recharge_inr integer not null default 50,
  max_recharge_inr integer not null default 10000,
  support_contact text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint app_settings_single_row check (id),
  constraint app_settings_values_check check (
    free_credits_per_month between 0 and 100
    and standard_rate_inr between 1 and 1000
    and bulk_rate_inr between 1 and 1000
    and bulk_min_recharge_inr between 1 and 1000000
    and min_recharge_inr between 1 and 1000000
    and max_recharge_inr between min_recharge_inr and 1000000
    and (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$')
    and (payee_name is null or length(payee_name) <= 100)
    and (support_contact is null or length(support_contact) <= 200)
  )
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Accounts and the credit ledger
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 0,
  -- First day of the month (India time) that free_used counts.
  free_month date not null,
  free_used integer not null default 0,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_credits_check check (credits >= 0 and free_used >= 0)
);

-- credits: change to paid credits; free_credits: change to this month's free
-- credits (negative when used, positive when given back).
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  credits integer not null default 0,
  free_credits integer not null default 0,
  balance_after integer not null,
  recharge_id uuid,
  look_id uuid,
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint credit_ledger_kind_check check (kind in ('RECHARGE', 'TRY_ON', 'REFUND', 'ADJUSTMENT'))
);

create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Recharges and bank credit alerts
-- ---------------------------------------------------------------------------
create table if not exists public.recharges (
  id uuid primary key default gen_random_uuid(),
  -- Kept (without the person) for the accounts if the user is deleted.
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  amount_inr integer not null,
  utr text not null,
  rate_inr integer not null,
  credits integer not null,
  status text not null default 'PENDING',
  auto_verified boolean not null default false,
  payment_alert_id uuid,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  constraint recharges_values_check check (
    amount_inr > 0 and rate_inr > 0 and credits > 0 and utr ~ '^[0-9]{12}$'
  ),
  constraint recharges_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED'))
);

-- One UTR is credited once. A rejected one may be sent again (corrected amount).
create unique index if not exists recharges_utr_active
  on public.recharges (utr) where status in ('PENDING', 'APPROVED');
create index if not exists recharges_status_idx on public.recharges (status, created_at desc);
create index if not exists recharges_user_idx on public.recharges (user_id, created_at desc);

-- A credit to the platform's bank account, read from the bank's SMS or email.
create table if not exists public.payment_alerts (
  id uuid primary key default gen_random_uuid(),
  utr text not null unique,
  amount_inr numeric(12,2) not null,
  sender text,
  message text,
  recharge_id uuid references public.recharges(id) on delete set null,
  received_at timestamptz not null default now(),
  constraint payment_alerts_values_check check (
    amount_inr > 0 and utr ~ '^[0-9]{12}$'
    and (sender is null or length(sender) <= 100)
    and (message is null or length(message) <= 1000)
  )
);

create index if not exists payment_alerts_unmatched_idx
  on public.payment_alerts (received_at desc) where recharge_id is null;

-- ---------------------------------------------------------------------------
-- Try-ons
-- ---------------------------------------------------------------------------
-- One "Try on" press: the customer's photo and up to 5 garment photos.
create table if not exists public.try_on_batches (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_path text,
  garment_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  purged_at timestamptz
);

create index if not exists try_on_batches_user_idx on public.try_on_batches (user_id, created_at desc);
create index if not exists try_on_batches_expiry_idx
  on public.try_on_batches (expires_at) where purged_at is null;

-- One picture: a single garment, or a pair worn together.
-- garments: [{"index": 0, "category": "SAREE", "source": "FABRIC", "role": "MAIN"}, ...]
-- (a pair lists the main garment first, then the one worn with it).
create table if not exists public.looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.try_on_batches(id) on delete cascade,
  kind text not null,
  garments jsonb not null,
  credits integer not null,
  free_credits_used integer not null default 0,
  paid_credits_used integer not null default 0,
  status text not null default 'QUEUED',
  image_path text,
  ai_provider text,
  ai_model text,
  -- What the AI provider reported it used (tokens), and its cost in rupees.
  ai_usage jsonb,
  estimated_cost_inr numeric(12,4),
  latency_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  refunded_at timestamptz,
  constraint looks_kind_check check (
    (kind = 'SINGLE' and credits = 1) or (kind = 'PAIR' and credits = 2)
  ),
  constraint looks_credits_check check (
    free_credits_used >= 0 and paid_credits_used >= 0
    and free_credits_used + paid_credits_used = credits
  ),
  constraint looks_status_check check (status in ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

create index if not exists looks_user_idx on public.looks (user_id, created_at desc);
create index if not exists looks_batch_idx on public.looks (batch_id);
create index if not exists looks_open_idx
  on public.looks (created_at) where status in ('QUEUED', 'PROCESSING');

alter table public.app_admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.accounts enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.recharges enable row level security;
alter table public.payment_alerts enable row level security;
alter table public.try_on_batches enable row level security;
alter table public.looks enable row level security;

revoke all on table public.app_admins, public.app_settings, public.accounts, public.credit_ledger,
  public.recharges, public.payment_alerts, public.try_on_batches,
  public.looks from public, anon, authenticated;
grant select, insert, update, delete on table public.app_admins, public.app_settings, public.accounts,
  public.credit_ledger, public.recharges, public.payment_alerts,
  public.try_on_batches, public.looks to service_role;

-- Private photo bucket (10 MB, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('try-on-photos', 'try-on-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Functions. Every change to credits happens here, under a row lock on the
-- account, with a ledger row.
-- ---------------------------------------------------------------------------

-- The account row, created on first use and locked for this transaction.
-- A new month (India time) resets the free credits used.
create or replace function public.lock_account(p_user_id uuid)
returns public.accounts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  v_account public.accounts;
begin
  if p_user_id is null then raise exception 'INVALID_INPUT'; end if;
  insert into public.accounts (user_id, free_month) values (p_user_id, v_month)
  on conflict (user_id) do nothing;
  select * into v_account from public.accounts where user_id = p_user_id for update;
  if v_account.free_month <> v_month then
    update public.accounts set free_month = v_month, free_used = 0, updated_at = now()
    where user_id = p_user_id returning * into v_account;
  end if;
  return v_account;
end $$;

create or replace function public.account_json(p_account public.accounts)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'credits', p_account.credits,
    'freeCreditsPerMonth', s.free_credits_per_month,
    'freeLeft', greatest(0, s.free_credits_per_month - p_account.free_used),
    'termsVersion', p_account.terms_version,
    'termsAcceptedAt', p_account.terms_accepted_at
  )
  from public.app_settings s where s.id
$$;

-- The account (created on first sign-in), optionally accepting the terms.
create or replace function public.get_account(p_user_id uuid, p_accept_terms_version text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
begin
  v_account := public.lock_account(p_user_id);
  if p_accept_terms_version is not null then
    if length(p_accept_terms_version) not between 1 and 40 then raise exception 'INVALID_INPUT'; end if;
    update public.accounts
      set terms_version = p_accept_terms_version, terms_accepted_at = now(), updated_at = now()
      where user_id = p_user_id returning * into v_account;
  end if;
  return public.account_json(v_account);
end $$;

-- Queues the looks of one "Try on" press and takes their credits (this
-- month's free credits first). Returns {"looks": [...], "account": {...}} or
-- {"error": "INSUFFICIENT_CREDITS" | "TERMS_REQUIRED", ...}.
-- p_looks: [{"kind": "SINGLE"|"PAIR", "garments": [{"index", "category", "source"}]}]
create or replace function public.create_looks(
  p_user_id uuid, p_batch_id uuid, p_photo_path text, p_garment_paths text[],
  p_expires_at timestamptz, p_terms_version text, p_looks jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_settings public.app_settings;
  v_free_left integer;
  v_needed integer := 0;
  v_look jsonb;
  v_kind text;
  v_cost integer;
  v_free integer;
  v_paid integer;
  v_id uuid;
  v_created jsonb := '[]'::jsonb;
begin
  if p_batch_id is null or p_photo_path is null or p_expires_at is null
    or p_looks is null or jsonb_typeof(p_looks) <> 'array'
    or jsonb_array_length(p_looks) not between 1 and 5
    or coalesce(array_length(p_garment_paths, 1), 0) not between 1 and 5 then
    raise exception 'INVALID_INPUT';
  end if;

  for v_look in select * from jsonb_array_elements(p_looks) loop
    v_kind := v_look ->> 'kind';
    if v_kind not in ('SINGLE', 'PAIR') or jsonb_typeof(v_look -> 'garments') <> 'array'
      or jsonb_array_length(v_look -> 'garments') <> (case v_kind when 'SINGLE' then 1 else 2 end) then
      raise exception 'INVALID_INPUT';
    end if;
    v_needed := v_needed + case v_kind when 'SINGLE' then 1 else 2 end;
  end loop;

  select * into v_settings from public.app_settings where id;
  v_account := public.lock_account(p_user_id);
  if v_account.terms_version is distinct from p_terms_version then
    return jsonb_build_object('error', 'TERMS_REQUIRED');
  end if;
  v_free_left := greatest(0, v_settings.free_credits_per_month - v_account.free_used);
  if v_free_left + v_account.credits < v_needed then
    return jsonb_build_object('error', 'INSUFFICIENT_CREDITS', 'needed', v_needed,
      'available', v_free_left + v_account.credits, 'account', public.account_json(v_account));
  end if;

  insert into public.try_on_batches (id, user_id, photo_path, garment_paths, expires_at)
  values (p_batch_id, p_user_id, p_photo_path, p_garment_paths, p_expires_at);

  for v_look in select * from jsonb_array_elements(p_looks) loop
    v_kind := v_look ->> 'kind';
    v_cost := case v_kind when 'SINGLE' then 1 else 2 end;
    v_free := least(v_free_left, v_cost);
    v_paid := v_cost - v_free;
    v_free_left := v_free_left - v_free;

    update public.accounts
      set credits = credits - v_paid, free_used = free_used + v_free, updated_at = now()
      where user_id = p_user_id returning * into v_account;

    insert into public.looks (user_id, batch_id, kind, garments, credits, free_credits_used, paid_credits_used)
    values (p_user_id, p_batch_id, v_kind, v_look -> 'garments', v_cost, v_free, v_paid)
    returning id into v_id;

    insert into public.credit_ledger (user_id, kind, credits, free_credits, balance_after, look_id)
    values (p_user_id, 'TRY_ON', -v_paid, -v_free, v_account.credits, v_id);

    v_created := v_created || jsonb_build_object('id', v_id, 'kind', v_kind, 'credits', v_cost);
  end loop;

  return jsonb_build_object('looks', v_created, 'account', public.account_json(v_account));
end $$;

-- Marks a queued or running look FAILED and gives its credits back (once).
-- Free credits from an earlier month come back as paid credits.
create or replace function public.fail_look(p_look_id uuid, p_message text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_look public.looks;
  v_account public.accounts;
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  v_free_back integer;
  v_paid_back integer;
begin
  select * into v_look from public.looks where id = p_look_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  -- Account first, then the look (the same order as create_looks).
  v_account := public.lock_account(v_look.user_id);
  select * into v_look from public.looks where id = p_look_id for update;

  if v_look.status in ('QUEUED', 'PROCESSING') then
    update public.looks
      set status = 'FAILED', error_message = left(coalesce(p_message, 'The try-on could not be made.'), 500),
          completed_at = now()
      where id = p_look_id returning * into v_look;
  end if;
  if v_look.status <> 'FAILED' or v_look.refunded_at is not null then
    return jsonb_build_object('status', v_look.status, 'refunded', v_look.refunded_at is not null);
  end if;

  if date_trunc('month', v_look.created_at at time zone 'Asia/Kolkata')::date = v_month then
    v_free_back := least(v_look.free_credits_used, v_account.free_used);
  else
    v_free_back := 0;
  end if;
  v_paid_back := v_look.paid_credits_used + (v_look.free_credits_used - v_free_back);

  update public.accounts
    set credits = credits + v_paid_back, free_used = free_used - v_free_back, updated_at = now()
    where user_id = v_look.user_id returning * into v_account;
  update public.looks set refunded_at = now() where id = p_look_id;
  insert into public.credit_ledger (user_id, kind, credits, free_credits, balance_after, look_id, reason)
  values (v_look.user_id, 'REFUND', v_paid_back, v_free_back, v_account.credits, p_look_id, 'Try-on failed');

  return jsonb_build_object('status', 'FAILED', 'refunded', true);
end $$;

-- Credits an approved recharge. Caller holds the account lock and the
-- recharge row lock.
create or replace function public.credit_recharge(
  p_recharge public.recharges, p_actor uuid, p_auto boolean, p_alert_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
begin
  update public.recharges
    set status = 'APPROVED', auto_verified = p_auto, payment_alert_id = p_alert_id,
        reviewed_by = p_actor, reviewed_at = now(), rejection_reason = null
    where id = p_recharge.id;
  if p_alert_id is not null then
    update public.payment_alerts set recharge_id = p_recharge.id where id = p_alert_id;
  end if;
  update public.accounts
    set credits = credits + p_recharge.credits, updated_at = now()
    where user_id = p_recharge.user_id returning * into v_account;
  insert into public.credit_ledger (user_id, kind, credits, balance_after, recharge_id, actor_id,
    reason)
  values (p_recharge.user_id, 'RECHARGE', p_recharge.credits, v_account.credits, p_recharge.id, p_actor,
    case when p_auto then 'Verified automatically' else 'Verified by admin' end);
end $$;

-- The customer paid by UPI and sends the UTR. Approved at once when the
-- bank's alert for that UTR and amount has already arrived.
-- Returns {"recharge": {...}} or {"error": ...}.
create or replace function public.submit_recharge(
  p_user_id uuid, p_email text, p_amount_inr integer, p_utr text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settings public.app_settings;
  v_account public.accounts;
  v_existing public.recharges;
  v_recharge public.recharges;
  v_alert public.payment_alerts;
  v_rate integer;
  v_pending integer;
begin
  if p_utr is null or p_utr !~ '^[0-9]{12}$' then
    return jsonb_build_object('error', 'INVALID_UTR');
  end if;
  select * into v_settings from public.app_settings where id;
  if p_amount_inr is null or p_amount_inr < v_settings.min_recharge_inr or p_amount_inr > v_settings.max_recharge_inr then
    return jsonb_build_object('error', 'INVALID_AMOUNT', 'min', v_settings.min_recharge_inr, 'max', v_settings.max_recharge_inr);
  end if;
  v_rate := case when p_amount_inr >= v_settings.bulk_min_recharge_inr then v_settings.bulk_rate_inr else v_settings.standard_rate_inr end;
  if p_amount_inr % v_rate <> 0 then
    return jsonb_build_object('error', 'INVALID_AMOUNT_STEP', 'step', v_rate);
  end if;

  v_account := public.lock_account(p_user_id);
  -- The same UTR again from the same person: answer with what is there.
  select * into v_existing from public.recharges
    where utr = p_utr and status in ('PENDING', 'APPROVED');
  if found then
    if v_existing.user_id = p_user_id and v_existing.amount_inr = p_amount_inr then
      return jsonb_build_object('recharge', to_jsonb(v_existing) - 'user_email', 'repeat', true);
    end if;
    return jsonb_build_object('error', 'UTR_ALREADY_USED');
  end if;
  select count(*) into v_pending from public.recharges where user_id = p_user_id and status = 'PENDING';
  if v_pending >= 5 then
    return jsonb_build_object('error', 'TOO_MANY_PENDING');
  end if;

  insert into public.recharges (user_id, user_email, amount_inr, utr, rate_inr, credits)
  values (p_user_id, left(p_email, 320), p_amount_inr, p_utr, v_rate, p_amount_inr / v_rate)
  returning * into v_recharge;

  select * into v_alert from public.payment_alerts where utr = p_utr and recharge_id is null for update;
  if found and v_alert.amount_inr = p_amount_inr then
    perform public.credit_recharge(v_recharge, null, true, v_alert.id);
    select * into v_recharge from public.recharges where id = v_recharge.id;
  end if;

  return jsonb_build_object('recharge', to_jsonb(v_recharge) - 'user_email');
end $$;

-- A credit to the platform's account, from the bank's SMS or email alert.
-- Approves the pending recharge with the same UTR and amount.
-- Returns {"outcome": "MATCHED" | "STORED" | "AMOUNT_MISMATCH" | "DUPLICATE"}.
create or replace function public.record_payment_alert(
  p_utr text, p_amount_inr numeric, p_sender text, p_message text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_alert_id uuid;
  v_recharge public.recharges;
  v_user uuid;
begin
  if p_utr is null or p_utr !~ '^[0-9]{12}$' or p_amount_inr is null or p_amount_inr <= 0 then
    raise exception 'INVALID_INPUT';
  end if;
  insert into public.payment_alerts (utr, amount_inr, sender, message)
  values (p_utr, p_amount_inr, left(p_sender, 100), left(p_message, 1000))
  on conflict (utr) do nothing
  returning id into v_alert_id;
  if v_alert_id is null then
    return jsonb_build_object('outcome', 'DUPLICATE');
  end if;

  select user_id into v_user from public.recharges where utr = p_utr and status = 'PENDING';
  if v_user is null then
    return jsonb_build_object('outcome', 'STORED');
  end if;
  perform public.lock_account(v_user);
  select * into v_recharge from public.recharges where utr = p_utr and status = 'PENDING' for update;
  if not found then
    return jsonb_build_object('outcome', 'STORED');
  end if;
  if v_recharge.amount_inr <> p_amount_inr then
    return jsonb_build_object('outcome', 'AMOUNT_MISMATCH', 'rechargeId', v_recharge.id);
  end if;
  perform public.credit_recharge(v_recharge, null, true, v_alert_id);
  return jsonb_build_object('outcome', 'MATCHED', 'rechargeId', v_recharge.id);
end $$;

-- Platform Admin approves or rejects a pending recharge.
create or replace function public.review_recharge(
  p_recharge_id uuid, p_admin_id uuid, p_decision text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_recharge public.recharges;
  v_alert_id uuid;
begin
  select user_id into v_user from public.recharges where id = p_recharge_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_user is null then return jsonb_build_object('error', 'USER_DELETED'); end if;
  perform public.lock_account(v_user);
  select * into v_recharge from public.recharges where id = p_recharge_id for update;

  if v_recharge.status <> 'PENDING' then
    if (v_recharge.status = 'APPROVED' and p_decision = 'APPROVE') or (v_recharge.status = 'REJECTED' and p_decision = 'REJECT') then
      return jsonb_build_object('status', v_recharge.status, 'alreadyReviewed', true);
    end if;
    return jsonb_build_object('error', 'ALREADY_REVIEWED', 'status', v_recharge.status);
  end if;

  if p_decision = 'APPROVE' then
    select id into v_alert_id from public.payment_alerts where utr = v_recharge.utr and recharge_id is null;
    perform public.credit_recharge(v_recharge, p_admin_id, false, v_alert_id);
    return jsonb_build_object('status', 'APPROVED');
  elsif p_decision = 'REJECT' then
    update public.recharges
      set status = 'REJECTED', reviewed_by = p_admin_id, reviewed_at = now(),
          rejection_reason = left(coalesce(nullif(btrim(p_reason), ''), 'Payment not found'), 200)
      where id = p_recharge_id;
    return jsonb_build_object('status', 'REJECTED');
  end if;
  raise exception 'INVALID_INPUT';
end $$;

-- Platform Admin gives (or takes back) paid credits, by the person's email.
create or replace function public.adjust_credits(
  p_email text, p_admin_id uuid, p_credits integer, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_account public.accounts;
begin
  if p_credits is null or p_credits = 0 or abs(p_credits) > 100000
    or p_reason is null or length(btrim(p_reason)) not between 3 and 200 then
    raise exception 'INVALID_INPUT';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_user is null then return jsonb_build_object('error', 'USER_NOT_FOUND'); end if;
  v_account := public.lock_account(v_user);
  if v_account.credits + p_credits < 0 then
    return jsonb_build_object('error', 'NOT_ENOUGH_CREDITS', 'credits', v_account.credits);
  end if;
  update public.accounts set credits = credits + p_credits, updated_at = now()
    where user_id = v_user returning * into v_account;
  insert into public.credit_ledger (user_id, kind, credits, balance_after, actor_id, reason)
  values (v_user, 'ADJUSTMENT', p_credits, v_account.credits, p_admin_id, btrim(p_reason));
  return jsonb_build_object('credits', v_account.credits);
end $$;

-- Numbers for the admin page, from p_since (start of the month, India time).
create or replace function public.admin_stats(p_since timestamptz)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'users', (select count(*) from public.accounts),
    'newUsers', (select count(*) from public.accounts where created_at >= p_since),
    'pictures', (select count(*) from public.looks where status = 'COMPLETED' and created_at >= p_since),
    'failedPictures', (select count(*) from public.looks where status = 'FAILED' and created_at >= p_since),
    'freeCreditsUsed', (select coalesce(sum(free_credits_used), 0) from public.looks
      where status = 'COMPLETED' and created_at >= p_since),
    'paidCreditsUsed', (select coalesce(sum(paid_credits_used), 0) from public.looks
      where status = 'COMPLETED' and created_at >= p_since),
    'aiCostInr', (select coalesce(sum(estimated_cost_inr), 0) from public.looks where created_at >= p_since),
    'rechargedInr', (select coalesce(sum(amount_inr), 0) from public.recharges
      where status = 'APPROVED' and reviewed_at >= p_since),
    'autoVerifiedRecharges', (select count(*) from public.recharges
      where status = 'APPROVED' and auto_verified and reviewed_at >= p_since),
    'pendingRecharges', (select count(*) from public.recharges where status = 'PENDING'),
    'unmatchedAlerts', (select count(*) from public.payment_alerts where recharge_id is null)
  )
$$;

revoke all on function public.lock_account(uuid) from public, anon, authenticated;
revoke all on function public.account_json(public.accounts) from public, anon, authenticated;
revoke all on function public.credit_recharge(public.recharges, uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.get_account(uuid, text) from public, anon, authenticated;
revoke all on function public.create_looks(uuid, uuid, text, text[], timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_look(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_recharge(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.record_payment_alert(text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.review_recharge(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.adjust_credits(text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_stats(timestamptz) from public, anon, authenticated;

grant execute on function public.get_account(uuid, text) to service_role;
grant execute on function public.create_looks(uuid, uuid, text, text[], timestamptz, text, jsonb) to service_role;
grant execute on function public.fail_look(uuid, text) to service_role;
grant execute on function public.submit_recharge(uuid, text, integer, text) to service_role;
grant execute on function public.record_payment_alert(text, numeric, text, text) to service_role;
grant execute on function public.review_recharge(uuid, uuid, text, text) to service_role;
grant execute on function public.adjust_credits(text, uuid, integer, text) to service_role;
grant execute on function public.admin_stats(timestamptz) to service_role;
