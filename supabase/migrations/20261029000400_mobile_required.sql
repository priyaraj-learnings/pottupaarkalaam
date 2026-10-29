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
