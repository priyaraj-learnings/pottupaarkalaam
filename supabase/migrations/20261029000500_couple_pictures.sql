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
