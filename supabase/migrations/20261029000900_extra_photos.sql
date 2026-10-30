-- Extra photos for paying customers: a try normally takes up to 3 clothes
-- photos; a customer with a recharge approved this month (India time) can add
-- a 4th and 5th. Each of those pictures costs extra_photo_credits more (1 by
-- default, so 2 credits a picture), from paid credits only. The extra is part
-- of that picture's credits, so a failed picture gives it back like the rest.

alter table public.app_settings
  add column if not exists extra_photos_enabled boolean not null default true,
  add column if not exists extra_photo_credits integer not null default 1;
alter table public.app_settings drop constraint if exists app_settings_extra_photos_check;
alter table public.app_settings add constraint app_settings_extra_photos_check check (extra_photo_credits between 1 and 10);

alter table public.looks add column if not exists extra_credits integer not null default 0;
alter table public.looks drop constraint if exists looks_kind_check;
alter table public.looks add constraint looks_kind_check check (
  (kind = 'SINGLE' and credits = 1 + extra_credits)
  or (kind = 'PAIR' and credits = 2 + extra_credits)
  or (kind = 'COUPLE' and credits between 1 and 50 and free_credits_used = 0 and extra_credits = 0)
);
alter table public.looks drop constraint if exists looks_extra_check;
alter table public.looks add constraint looks_extra_check check (extra_credits >= 0 and extra_credits <= paid_credits_used);

-- A recharge approved this calendar month (India time).
create or replace function public.paid_this_month(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.recharges
    where user_id = p_user_id and status = 'APPROVED'
      and coalesce(reviewed_at, created_at) >= (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
  )
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
    'phoneAskedAt', p_account.phone_asked_at,
    'coupleOptIn', p_account.couple_opt_in,
    'paidThisMonth', public.paid_this_month(p_account.user_id)
  )
  from public.app_settings s where s.id
$$;

-- As in 20261029000400_mobile_required.sql, plus extra photos: garments with
-- index 3 or 4 (the 4th and 5th photo) are allowed only with extra photos on
-- and a recharge this month, and each adds extra_photo_credits to its picture,
-- paid credits only. Returns {"looks": [...], "account": {...}} or
-- {"error": "INSUFFICIENT_CREDITS" | "TERMS_REQUIRED" | "EXTRA_PHOTOS_NOT_ALLOWED", ...}.
create or replace function public.create_looks(
  p_user_id uuid, p_batch_id uuid, p_photo_path text, p_garment_paths text[],
  p_expires_at timestamptz, p_terms_version text, p_looks jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_settings public.app_settings;
  v_free_left integer;
  v_base_needed integer := 0;
  v_extra_needed integer := 0;
  v_paid_needed integer;
  v_look jsonb;
  v_kind text;
  v_cost integer;
  v_extra integer;
  v_free integer;
  v_paid integer;
  v_id uuid;
  v_garment_count integer := coalesce(array_length(p_garment_paths, 1), 0);
  v_created jsonb := '[]'::jsonb;
begin
  if p_batch_id is null or p_photo_path is null or p_expires_at is null
    or p_looks is null or jsonb_typeof(p_looks) <> 'array'
    or jsonb_array_length(p_looks) not between 1 and 5
    or v_garment_count not between 1 and 5 then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_settings from public.app_settings where id;

  for v_look in select * from jsonb_array_elements(p_looks) loop
    v_kind := v_look ->> 'kind';
    if v_kind not in ('SINGLE', 'PAIR') or jsonb_typeof(v_look -> 'garments') <> 'array'
      or jsonb_array_length(v_look -> 'garments') <> (case v_kind when 'SINGLE' then 1 else 2 end) then
      raise exception 'INVALID_INPUT';
    end if;
    v_base_needed := v_base_needed + case v_kind when 'SINGLE' then 1 else 2 end;
    v_extra_needed := v_extra_needed + v_settings.extra_photo_credits * (
      select count(*)::integer from jsonb_array_elements(v_look -> 'garments') g where (g ->> 'index')::integer >= 3
    );
  end loop;

  v_account := public.lock_account(p_user_id);
  if v_account.terms_version is distinct from p_terms_version then
    return jsonb_build_object('error', 'TERMS_REQUIRED');
  end if;
  if v_extra_needed > 0 and not (v_settings.extra_photos_enabled and public.paid_this_month(p_user_id)) then
    return jsonb_build_object('error', 'EXTRA_PHOTOS_NOT_ALLOWED');
  end if;
  v_free_left := public.free_left(v_account, v_settings);
  -- Free credits pay only for the normal part; the extra is paid credits.
  v_paid_needed := v_base_needed - least(v_free_left, v_base_needed) + v_extra_needed;
  if v_paid_needed > v_account.credits then
    return jsonb_build_object('error', 'INSUFFICIENT_CREDITS', 'needed', v_base_needed + v_extra_needed,
      'available', v_free_left + v_account.credits, 'paidNeeded', v_paid_needed,
      'account', public.account_json(v_account));
  end if;

  insert into public.try_on_batches (id, user_id, photo_path, garment_paths, expires_at)
  values (p_batch_id, p_user_id, p_photo_path, p_garment_paths, p_expires_at);

  for v_look in select * from jsonb_array_elements(p_looks) loop
    v_kind := v_look ->> 'kind';
    v_cost := case v_kind when 'SINGLE' then 1 else 2 end;
    v_extra := v_settings.extra_photo_credits * (
      select count(*)::integer from jsonb_array_elements(v_look -> 'garments') g where (g ->> 'index')::integer >= 3
    );
    v_free := least(v_free_left, v_cost);
    v_paid := v_cost - v_free + v_extra;
    v_free_left := v_free_left - v_free;

    update public.accounts
      set credits = credits - v_paid, free_used = free_used + v_free, updated_at = now()
      where user_id = p_user_id returning * into v_account;

    insert into public.looks (user_id, batch_id, kind, garments, credits, extra_credits, free_credits_used, paid_credits_used)
    values (p_user_id, p_batch_id, v_kind, v_look -> 'garments', v_cost + v_extra, v_extra, v_free, v_paid)
    returning id into v_id;

    insert into public.credit_ledger (user_id, kind, credits, free_credits, balance_after, look_id, reason)
    values (p_user_id, 'TRY_ON', -v_paid, -v_free, v_account.credits, v_id, case when v_extra > 0 then 'Extra photo' end);

    v_created := v_created || jsonb_build_object('id', v_id, 'kind', v_kind, 'credits', v_cost + v_extra);
  end loop;

  return jsonb_build_object('looks', v_created, 'account', public.account_json(v_account));
end $$;

revoke all on function public.paid_this_month(uuid) from public, anon, authenticated;
grant execute on function public.paid_this_month(uuid) to service_role;

notify pgrst, 'reload schema';
