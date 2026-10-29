-- PottuPaarkalaam: catch-up for a database that is missing the 29 October changes.
-- Contains, in order: 20261029000300_phone_login.sql, 20261029000400_mobile_required.sql,
-- 20261029000500_couple_pictures.sql, 20261029000600_delete_account.sql and 20261029000700_upi_qr.sql.
-- Safe to run more than once.
--
-- Supabase → the project the app uses → SQL Editor → New query → paste ALL of this → Run.
-- It runs as one piece: if any line fails, nothing is changed and the error is shown.
-- The last result must show five "true" columns.

-- ====================================================================
-- 20261029000300_phone_login.sql
-- ====================================================================
-- Sign-in with a mobile number through the admin's MSG91 OTP widget, set in
-- /admin Settings. The widget ID and token are public (the browser loads the
-- widget with them); the auth key is secret: only the server reads it, to
-- confirm each sign-in with MSG91. app_settings stays service_role only.

alter table public.app_settings
  add column if not exists msg91_widget_id text,
  add column if not exists msg91_token_auth text,
  add column if not exists msg91_auth_key text;

alter table public.app_settings drop constraint if exists app_settings_msg91_check;
alter table public.app_settings add constraint app_settings_msg91_check check (
  coalesce(length(msg91_widget_id), 0) <= 100
  and coalesce(length(msg91_token_auth), 0) <= 300
  and coalesce(length(msg91_auth_key), 0) <= 300
);

notify pgrst, 'reload schema';

-- ====================================================================
-- 20261029000400_mobile_required.sql
-- ====================================================================
-- Free credits for one mobile number a month. A mobile number verified by an
-- SMS code (the MSG91 widget) belongs to one account only, and when the admin
-- turns on free_needs_mobile, only accounts with a verified number get free
-- credits; the app then asks every Google or email account to verify one.

alter table public.accounts add column if not exists phone_verified_at timestamptz;
create unique index if not exists accounts_verified_phone_key
  on public.accounts (phone) where phone_verified_at is not null;

alter table public.app_settings add column if not exists free_needs_mobile boolean not null default false;

-- This month's free credits left for an account (a new month resets them).
create or replace function public.free_left(p_account public.accounts, p_settings public.app_settings)
returns integer
language sql stable set search_path = public, pg_temp as $$
  select case
    when p_settings.free_needs_mobile and p_account.phone_verified_at is null then 0
    when p_account.free_month = date_trunc('month', now() at time zone 'Asia/Kolkata')::date
      then greatest(0, p_settings.free_credits_per_month - p_account.free_used)
    else p_settings.free_credits_per_month
  end
$$;

create or replace function public.account_json(p_account public.accounts)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'credits', p_account.credits,
    'freeCreditsPerMonth', s.free_credits_per_month,
    'freeLeft', public.free_left(p_account, s),
    'termsVersion', p_account.terms_version,
    'termsAcceptedAt', p_account.terms_accepted_at,
    'phone', p_account.phone,
    'phoneVerified', p_account.phone_verified_at is not null,
    'offersOk', p_account.offers_ok,
    'phoneAskedAt', p_account.phone_asked_at
  )
  from public.app_settings s where s.id
$$;

-- As in 20261026000100_pottupaarkalaam.sql, with free credits from free_left()
-- (none without a verified mobile number when the admin requires one).
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
  v_free_left := public.free_left(v_account, v_settings);
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

-- Saves a mobile number MSG91 verified for this person. Another account with
-- the same verified number: {"error": "PHONE_TAKEN"}. p_offers_ok null keeps the
-- offers choice for the same number.
create or replace function public.verify_phone(p_user_id uuid, p_phone text, p_offers_ok boolean default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
begin
  if p_phone is null or p_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  v_account := public.lock_account(p_user_id);
  if exists (select 1 from public.accounts
             where phone = p_phone and phone_verified_at is not null and user_id <> p_user_id) then
    return jsonb_build_object('error', 'PHONE_TAKEN');
  end if;
  update public.accounts set
    offers_ok = coalesce(p_offers_ok, offers_ok and phone is not distinct from p_phone),
    offers_ok_at = case
      when coalesce(p_offers_ok, offers_ok and phone is not distinct from p_phone) is distinct from offers_ok then now()
      else offers_ok_at end,
    phone_updated_at = case when phone is distinct from p_phone then now() else phone_updated_at end,
    phone = p_phone,
    phone_verified_at = now(),
    phone_asked_at = now(),
    updated_at = now()
  where user_id = p_user_id returning * into v_account;
  return jsonb_build_object('account', public.account_json(v_account));
exception when unique_violation then
  return jsonb_build_object('error', 'PHONE_TAKEN');
end $$;

-- As in 20261029000100_mobile_number.sql, but a verified number can only be
-- changed by verifying the new one (verify_phone), never typed over or removed.
create or replace function public.save_phone(p_user_id uuid, p_phone text, p_offers_ok boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_offers boolean := p_phone is not null and coalesce(p_offers_ok, false);
begin
  if p_phone is not null and p_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  v_account := public.lock_account(p_user_id);
  if v_account.phone_verified_at is not null and p_phone is distinct from v_account.phone then
    raise exception 'PHONE_VERIFIED';
  end if;
  update public.accounts set
    phone = p_phone,
    phone_updated_at = case when phone is distinct from p_phone then now() else phone_updated_at end,
    phone_asked_at = now(),
    offers_ok = v_offers,
    offers_ok_at = case when offers_ok is distinct from v_offers then now() else offers_ok_at end,
    updated_at = now()
  where user_id = p_user_id returning * into v_account;
  return public.account_json(v_account);
end $$;

revoke all on function public.verify_phone(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.verify_phone(uuid, text, boolean) to service_role;

notify pgrst, 'reload schema';

-- ====================================================================
-- 20261029000500_couple_pictures.sql
-- ====================================================================
-- Couple pictures: one picture of two people, him and her, each in their own
-- new garment. The admin turns them on and sets their price in credits; each
-- customer chooses whether to show them; they use paid credits only.

alter table public.app_settings
  add column if not exists couple_enabled boolean not null default false,
  add column if not exists couple_credits integer not null default 3;
alter table public.app_settings drop constraint if exists app_settings_couple_check;
alter table public.app_settings add constraint app_settings_couple_check check (couple_credits between 1 and 50);

alter table public.accounts add column if not exists couple_opt_in boolean not null default false;

-- The second person's photo (hers) of a couple picture; photo_path is his.
alter table public.try_on_batches add column if not exists partner_photo_path text;

alter table public.looks drop constraint if exists looks_kind_check;
alter table public.looks add constraint looks_kind_check check (
  (kind = 'SINGLE' and credits = 1)
  or (kind = 'PAIR' and credits = 2)
  or (kind = 'COUPLE' and credits between 1 and 50 and free_credits_used = 0)
);

create or replace function public.account_json(p_account public.accounts)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'credits', p_account.credits,
    'freeCreditsPerMonth', s.free_credits_per_month,
    'freeLeft', public.free_left(p_account, s),
    'termsVersion', p_account.terms_version,
    'termsAcceptedAt', p_account.terms_accepted_at,
    'phone', p_account.phone,
    'phoneVerified', p_account.phone_verified_at is not null,
    'offersOk', p_account.offers_ok,
    'phoneAskedAt', p_account.phone_asked_at,
    'coupleOptIn', p_account.couple_opt_in
  )
  from public.app_settings s where s.id
$$;

-- The customer's "Couple pictures" switch.
create or replace function public.set_couple_opt_in(p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
begin
  v_account := public.lock_account(p_user_id);
  update public.accounts set couple_opt_in = coalesce(p_on, false), updated_at = now()
  where user_id = p_user_id returning * into v_account;
  return public.account_json(v_account);
end $$;

-- Takes a couple picture's credits (paid credits only) and queues it.
-- Returns {"look": {...}, "account": {...}} or {"error": "COUPLE_OFF" |
-- "TERMS_REQUIRED" | "INSUFFICIENT_CREDITS", ...}.
-- p_garments: [{"index": 0, "category", "source", "role": "HIS"},
--              {"index": 1, "category", "source", "role": "HER"}],
-- with p_garment_paths in the same order.
create or replace function public.create_couple_look(
  p_user_id uuid, p_batch_id uuid, p_photo_path text, p_partner_photo_path text,
  p_garment_paths text[], p_expires_at timestamptz, p_terms_version text, p_garments jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_settings public.app_settings;
  v_cost integer;
  v_id uuid;
begin
  if p_batch_id is null or p_photo_path is null or p_partner_photo_path is null or p_expires_at is null
    or coalesce(array_length(p_garment_paths, 1), 0) <> 2
    or p_garments is null or jsonb_typeof(p_garments) <> 'array' or jsonb_array_length(p_garments) <> 2
    or p_garments -> 0 ->> 'role' is distinct from 'HIS'
    or p_garments -> 1 ->> 'role' is distinct from 'HER' then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_settings from public.app_settings where id;
  v_account := public.lock_account(p_user_id);
  if not v_settings.couple_enabled or not v_account.couple_opt_in then
    return jsonb_build_object('error', 'COUPLE_OFF');
  end if;
  if v_account.terms_version is distinct from p_terms_version then
    return jsonb_build_object('error', 'TERMS_REQUIRED');
  end if;
  v_cost := v_settings.couple_credits;
  if v_account.credits < v_cost then
    return jsonb_build_object('error', 'INSUFFICIENT_CREDITS', 'needed', v_cost,
      'available', v_account.credits, 'account', public.account_json(v_account));
  end if;

  insert into public.try_on_batches (id, user_id, photo_path, partner_photo_path, garment_paths, expires_at)
  values (p_batch_id, p_user_id, p_photo_path, p_partner_photo_path, p_garment_paths, p_expires_at);

  update public.accounts set credits = credits - v_cost, updated_at = now()
  where user_id = p_user_id returning * into v_account;

  insert into public.looks (user_id, batch_id, kind, garments, credits, free_credits_used, paid_credits_used)
  values (p_user_id, p_batch_id, 'COUPLE', p_garments, v_cost, 0, v_cost)
  returning id into v_id;

  insert into public.credit_ledger (user_id, kind, credits, free_credits, balance_after, look_id, reason)
  values (p_user_id, 'TRY_ON', -v_cost, 0, v_account.credits, v_id, 'Couple picture');

  return jsonb_build_object('look', jsonb_build_object('id', v_id, 'kind', 'COUPLE', 'credits', v_cost),
    'account', public.account_json(v_account));
end $$;

revoke all on function public.set_couple_opt_in(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_couple_look(uuid, uuid, text, text, text[], timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_couple_opt_in(uuid, boolean) to service_role;
grant execute on function public.create_couple_look(uuid, uuid, text, text, text[], timestamptz, text, jsonb) to service_role;

notify pgrst, 'reload schema';

-- ====================================================================
-- 20261029000600_delete_account.sql
-- ====================================================================
-- "Delete my account" in the app (DPDP Act 2023, sections 6(4) and 12). The
-- app removes the photos from storage, calls prepare_account_deletion, then
-- deletes the sign-in (auth.users), which removes the account, credits and
-- pictures through their foreign keys. Payment records (recharges) stay for the
-- tax records, without the person: user_id becomes null and the email is
-- cleared here.
--
-- So that deleting and signing up again does not give a second month of free
-- credits, the free credits a verified number used this month are remembered
-- under a one-way code of the number (not the number) until the month ends.

create table if not exists public.free_use_carryover (
  phone_hash text primary key,
  free_month date not null,
  free_used integer not null check (free_used >= 0)
);
alter table public.free_use_carryover enable row level security;
revoke all on table public.free_use_carryover from public, anon, authenticated;

create or replace function public.phone_hash(p_phone text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to('pottupaarkalaam:' || p_phone, 'UTF8')), 'hex')
$$;

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
begin
  delete from public.free_use_carryover where free_month < v_month;
  select * into v_account from public.accounts where user_id = p_user_id for update;
  if found and v_account.phone is not null and v_account.phone_verified_at is not null
    and v_account.free_month = v_month and v_account.free_used > 0 then
    insert into public.free_use_carryover (phone_hash, free_month, free_used)
    values (public.phone_hash(v_account.phone), v_month, v_account.free_used)
    on conflict (phone_hash) do update set
      free_used = greatest(case when public.free_use_carryover.free_month = excluded.free_month
                                then public.free_use_carryover.free_used else 0 end, excluded.free_used),
      free_month = excluded.free_month;
  end if;
  update public.recharges set user_email = null where user_id = p_user_id;
end $$;

-- Hourly clean-up: codes from earlier months are no longer needed.
create or replace function public.purge_free_use_carryover()
returns integer
language sql security definer set search_path = public, pg_temp as $$
  with gone as (
    delete from public.free_use_carryover
    where free_month < date_trunc('month', now() at time zone 'Asia/Kolkata')::date
    returning 1
  )
  select count(*)::integer from gone
$$;

-- As in 20261029000400_mobile_required.sql, plus the carry-over above.
create or replace function public.verify_phone(p_user_id uuid, p_phone text, p_offers_ok boolean default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  v_carry integer;
begin
  if p_phone is null or p_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  v_account := public.lock_account(p_user_id);
  if exists (select 1 from public.accounts
             where phone = p_phone and phone_verified_at is not null and user_id <> p_user_id) then
    return jsonb_build_object('error', 'PHONE_TAKEN');
  end if;
  update public.accounts set
    offers_ok = coalesce(p_offers_ok, offers_ok and phone is not distinct from p_phone),
    offers_ok_at = case
      when coalesce(p_offers_ok, offers_ok and phone is not distinct from p_phone) is distinct from offers_ok then now()
      else offers_ok_at end,
    phone_updated_at = case when phone is distinct from p_phone then now() else phone_updated_at end,
    phone = p_phone,
    phone_verified_at = now(),
    phone_asked_at = now(),
    updated_at = now()
  where user_id = p_user_id returning * into v_account;
  -- Free credits this number already used this month in a deleted account.
  select c.free_used into v_carry from public.free_use_carryover c
  where c.phone_hash = public.phone_hash(p_phone) and c.free_month = v_month;
  if v_carry is not null then
    update public.accounts set
      free_used = greatest(case when free_month = v_month then free_used else 0 end, v_carry),
      free_month = v_month,
      updated_at = now()
    where user_id = p_user_id returning * into v_account;
  end if;
  return jsonb_build_object('account', public.account_json(v_account));
exception when unique_violation then
  return jsonb_build_object('error', 'PHONE_TAKEN');
end $$;

revoke all on function public.phone_hash(text) from public, anon, authenticated;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.purge_free_use_carryover() from public, anon, authenticated;
revoke all on function public.verify_phone(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.phone_hash(text) to service_role;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.purge_free_use_carryover() to service_role;
grant execute on function public.verify_phone(uuid, text, boolean) to service_role;

notify pgrst, 'reload schema';

-- ====================================================================
-- 20261029000700_upi_qr.sql
-- ====================================================================
-- The text inside the business's own UPI QR (upi://pay?pa=…&mc=…&aid=…&tr=…),
-- pasted or read from a photo in /admin Settings. The app's pay buttons and
-- QR then carry the same merchant details (category code, Google Pay merchant
-- ID and reference), adding only the amount and note, so UPI apps see a
-- payment to the verified business rather than a plain link.

alter table public.app_settings add column if not exists upi_qr_text text;
alter table public.app_settings drop constraint if exists app_settings_upi_qr_check;
alter table public.app_settings add constraint app_settings_upi_qr_check check (
  upi_qr_text is null or (length(upi_qr_text) <= 600 and upi_qr_text ~* '^upi://pay\?')
);

notify pgrst, 'reload schema';

-- ====================================================================
-- Check: all five must say true.
-- ====================================================================
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'msg91_widget_id') as mobile_sign_in,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'free_needs_mobile') as verified_mobile_rule,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'couple_enabled') as couple_pictures,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'free_use_carryover') as delete_account,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'upi_qr_text') as business_qr;
