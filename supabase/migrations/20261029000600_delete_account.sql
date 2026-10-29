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
