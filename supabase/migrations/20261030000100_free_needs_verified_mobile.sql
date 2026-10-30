-- Free credits always need a mobile number verified by an SMS code (no longer
-- an admin switch). Anyone may sign in with Google or email and use paid
-- credits, but the monthly free credits go only to an account with a verified
-- number, and a verified number belongs to one account only
-- (accounts_verified_phone_key), so the free credits go to one number a month.
-- free_needs_mobile stays as a column, always true, for older code.

update public.app_settings set free_needs_mobile = true where not free_needs_mobile;
alter table public.app_settings alter column free_needs_mobile set default true;

-- This month's free credits left for an account (a new month resets them):
-- none without a verified mobile number.
create or replace function public.free_left(p_account public.accounts, p_settings public.app_settings)
returns integer
language sql stable set search_path = public, pg_temp as $$
  select case
    when p_account.phone_verified_at is null then 0
    when p_account.free_month = date_trunc('month', now() at time zone 'Asia/Kolkata')::date
      then greatest(0, p_settings.free_credits_per_month - p_account.free_used)
    else p_settings.free_credits_per_month
  end
$$;

-- As in 20261029000600_delete_account.sql. Also, moving an account to a new
-- number remembers the free credits the old number used this month (as for a
-- deleted account), so the old number cannot take them again on another account.
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
  if v_account.phone is not null and v_account.phone_verified_at is not null
    and v_account.phone <> p_phone and v_account.free_used > 0 then
    insert into public.free_use_carryover (phone_hash, free_month, free_used)
    values (public.phone_hash(v_account.phone), v_month, v_account.free_used)
    on conflict (phone_hash) do update set
      free_used = greatest(case when public.free_use_carryover.free_month = excluded.free_month
                                then public.free_use_carryover.free_used else 0 end, excluded.free_used),
      free_month = excluded.free_month;
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
  -- Free credits this number already used this month on another account.
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

revoke all on function public.verify_phone(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.verify_phone(uuid, text, boolean) to service_role;

notify pgrst, 'reload schema';
