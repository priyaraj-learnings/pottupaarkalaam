-- Growth: email offers consent, refer a friend, and the monthly "your free
-- pictures are back" email.
--
-- 1. accounts.email_offers_ok: a separate consent to offers and news by email
--    (the existing offers_ok is for WhatsApp / SMS). Off until ticked.
-- 2. Refer a friend: every account has a referral_code (its invite link is
--    pp.inaivuit.com/?ref=CODE). A new account that came from a link records
--    the referral; once the friend's mobile number is verified, both get
--    app_settings.referral_credits credits (default 2), at most
--    referral_max_per_person friends per person (default 10). A mobile number
--    earns a referral reward once, ever (a one-way code of it is kept), so
--    deleting and signing up again does not earn it twice.
-- 3. Monthly email: sent once a month (monthly_email_sent_month) unless the
--    person unsubscribed (monthly_email_opt_out). The email service key
--    (Resend) is set in /admin Settings and only the server reads it.

alter table public.accounts
  add column if not exists email_offers_ok boolean not null default false,
  add column if not exists email_offers_ok_at timestamptz,
  add column if not exists referral_code text,
  add column if not exists monthly_email_opt_out boolean not null default false,
  add column if not exists monthly_email_sent_month date,
  add column if not exists monthly_email_sent_at timestamptz;

update public.accounts set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;
alter table public.accounts alter column referral_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
alter table public.accounts alter column referral_code set not null;
create unique index if not exists accounts_referral_code_key on public.accounts (referral_code);

alter table public.credit_ledger drop constraint if exists credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check
  check (kind in ('RECHARGE', 'TRY_ON', 'REFUND', 'ADJUSTMENT', 'REFERRAL'));

create table if not exists public.referrals (
  referee_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  credits integer
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id, rewarded_at);

create table if not exists public.referral_rewarded_phones (
  phone_hash text primary key,
  rewarded_at timestamptz not null default now()
);

alter table public.referrals enable row level security;
alter table public.referral_rewarded_phones enable row level security;
revoke all on table public.referrals, public.referral_rewarded_phones from public, anon, authenticated;
grant select, insert, update, delete on table public.referrals, public.referral_rewarded_phones to service_role;

alter table public.app_settings
  add column if not exists referral_credits integer not null default 2,
  add column if not exists referral_max_per_person integer not null default 10,
  add column if not exists monthly_email_enabled boolean not null default false,
  add column if not exists email_from text,
  add column if not exists resend_api_key text,
  -- This site's address (saved from /admin), for links in emails.
  add column if not exists app_url text;
alter table public.app_settings drop constraint if exists app_settings_growth_check;
alter table public.app_settings add constraint app_settings_growth_check check (
  referral_credits between 0 and 20
  and referral_max_per_person between 0 and 100
  and coalesce(length(email_from), 0) <= 200
  and coalesce(length(resend_api_key), 0) <= 200
  and coalesce(length(app_url), 0) <= 200
);

-- As in 20261029000900_extra_photos.sql, plus the email offers choice, the
-- invite code and how many friends have joined through it.
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
    'paidThisMonth', public.paid_this_month(p_account.user_id),
    'emailOffersOk', p_account.email_offers_ok,
    'monthlyEmailOk', not p_account.monthly_email_opt_out,
    'referralCode', p_account.referral_code,
    'referralCredits', s.referral_credits,
    'friendsJoined', (select count(*) from public.referrals r where r.referrer_user_id = p_account.user_id and r.rewarded_at is not null)
  )
  from public.app_settings s where s.id
$$;

create or replace function public.set_email_offers(p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
begin
  v_account := public.lock_account(p_user_id);
  update public.accounts set
    email_offers_ok = coalesce(p_on, false),
    email_offers_ok_at = case when email_offers_ok is distinct from coalesce(p_on, false) then now() else email_offers_ok_at end,
    updated_at = now()
  where user_id = p_user_id returning * into v_account;
  return public.account_json(v_account);
end $$;

-- Gives the referral reward if it is due: the friend's number is verified,
-- the inviter still has an account and room under the limit, and this number
-- has never earned one. Returns {"rewarded": true, "credits": n} or
-- {"rewarded": false, "reason": "..."}.
create or replace function public.settle_referral(p_referee uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_referral public.referrals;
  v_settings public.app_settings;
  v_referee public.accounts;
  v_referrer public.accounts;
  v_hash text;
  v_given integer;
begin
  select * into v_referral from public.referrals where referee_user_id = p_referee for update;
  if not found then return jsonb_build_object('rewarded', false, 'reason', 'NO_REFERRAL'); end if;
  if v_referral.rewarded_at is not null then return jsonb_build_object('rewarded', false, 'reason', 'ALREADY_REWARDED'); end if;
  if v_referral.referrer_user_id is null then return jsonb_build_object('rewarded', false, 'reason', 'INVITER_GONE'); end if;
  select * into v_settings from public.app_settings where id;
  if v_settings.referral_credits <= 0 then return jsonb_build_object('rewarded', false, 'reason', 'OFF'); end if;

  v_referee := public.lock_account(p_referee);
  if v_referee.phone_verified_at is null or v_referee.phone is null then
    return jsonb_build_object('rewarded', false, 'reason', 'NOT_VERIFIED');
  end if;
  v_hash := public.phone_hash(v_referee.phone);
  if exists (select 1 from public.referral_rewarded_phones where phone_hash = v_hash) then
    return jsonb_build_object('rewarded', false, 'reason', 'NUMBER_USED');
  end if;
  select count(*) into v_given from public.referrals
  where referrer_user_id = v_referral.referrer_user_id and rewarded_at is not null;
  if v_given >= v_settings.referral_max_per_person then
    return jsonb_build_object('rewarded', false, 'reason', 'LIMIT');
  end if;
  v_referrer := public.lock_account(v_referral.referrer_user_id);

  update public.accounts set credits = credits + v_settings.referral_credits, updated_at = now()
  where user_id = p_referee returning * into v_referee;
  insert into public.credit_ledger (user_id, kind, credits, balance_after, reason)
  values (p_referee, 'REFERRAL', v_settings.referral_credits, v_referee.credits, 'Joined through a friend''s invite');
  update public.accounts set credits = credits + v_settings.referral_credits, updated_at = now()
  where user_id = v_referral.referrer_user_id returning * into v_referrer;
  insert into public.credit_ledger (user_id, kind, credits, balance_after, reason)
  values (v_referral.referrer_user_id, 'REFERRAL', v_settings.referral_credits, v_referrer.credits, 'A friend joined through your invite');

  update public.referrals set rewarded_at = now(), credits = v_settings.referral_credits where referee_user_id = p_referee;
  insert into public.referral_rewarded_phones (phone_hash) values (v_hash);
  return jsonb_build_object('rewarded', true, 'credits', v_settings.referral_credits);
end $$;

-- A new account opened from an invite link. Only within 7 days of the account
-- being made, once, and never one's own code. Then settles it if it is due.
create or replace function public.claim_referral(p_user_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_referrer uuid;
begin
  v_account := public.lock_account(p_user_id);
  if exists (select 1 from public.referrals where referee_user_id = p_user_id) then
    return public.settle_referral(p_user_id);
  end if;
  if v_account.created_at < now() - interval '7 days' then
    return jsonb_build_object('rewarded', false, 'reason', 'NOT_NEW');
  end if;
  select user_id into v_referrer from public.accounts where referral_code = upper(btrim(coalesce(p_code, '')));
  if v_referrer is null then return jsonb_build_object('rewarded', false, 'reason', 'UNKNOWN_CODE'); end if;
  if v_referrer = p_user_id then return jsonb_build_object('rewarded', false, 'reason', 'OWN_CODE'); end if;
  insert into public.referrals (referee_user_id, referrer_user_id) values (p_user_id, v_referrer);
  return public.settle_referral(p_user_id);
end $$;

revoke all on function public.set_email_offers(uuid, boolean) from public, anon, authenticated;
revoke all on function public.settle_referral(uuid) from public, anon, authenticated;
revoke all on function public.claim_referral(uuid, text) from public, anon, authenticated;
grant execute on function public.set_email_offers(uuid, boolean) to service_role;
grant execute on function public.settle_referral(uuid) to service_role;
grant execute on function public.claim_referral(uuid, text) to service_role;

-- The customer's "monthly email" choice (also the unsubscribe link).
create or replace function public.set_monthly_email(p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
begin
  v_account := public.lock_account(p_user_id);
  update public.accounts set monthly_email_opt_out = not coalesce(p_on, false), updated_at = now()
  where user_id = p_user_id returning * into v_account;
  return public.account_json(v_account);
end $$;

-- Who gets this month's "your free pictures are back" email: accounts with a
-- real email (not a mobile-number sign-in) and a verified number (free
-- pictures need one), made before this month, that did not use all of last
-- month's free pictures, did not unsubscribe and were not sent it this month.
-- Marks them as sent (at most once a month, even if sending fails). At most
-- p_daily_limit a day (India time; the email service's free plan sends 100 a
-- day), so a long list goes out over the next days.
drop function if exists public.take_monthly_email_batch(integer);
create or replace function public.take_monthly_email_batch(p_limit integer default 100, p_daily_limit integer default 95)
returns table (user_id uuid, email text, name text, free_credits integer, referral_code text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  v_last date := (date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month')::date;
  v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_room integer;
  v_settings public.app_settings;
begin
  select * into v_settings from public.app_settings where id;
  if not v_settings.monthly_email_enabled or v_settings.free_credits_per_month <= 0 then return; end if;
  select greatest(0, coalesce(p_daily_limit, 95) - count(*)) into v_room
  from public.accounts a where a.monthly_email_sent_at >= v_today;
  if v_room <= 0 then return; end if;
  return query
  with picked as (
    select a.user_id from public.accounts a
    join auth.users u on u.id = a.user_id
    where a.phone_verified_at is not null
      and not a.monthly_email_opt_out
      and a.terms_version is not null
      and (a.monthly_email_sent_month is null or a.monthly_email_sent_month < v_month)
      and (a.created_at at time zone 'Asia/Kolkata')::date < v_month
      and not (a.free_month = v_last and a.free_used >= v_settings.free_credits_per_month)
      and u.email is not null and u.email like '%@%'
      and u.email not like 'pp-phone-%@inaivuit.com'
    order by a.created_at
    limit least(greatest(0, least(coalesce(p_limit, 100), 500)), v_room)
    for update of a skip locked
  ), marked as (
    update public.accounts a set monthly_email_sent_month = v_month, monthly_email_sent_at = now()
    from picked where a.user_id = picked.user_id
    returning a.user_id, a.referral_code
  )
  select m.user_id, u.email::text,
    nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')::text,
    v_settings.free_credits_per_month, m.referral_code
  from marked m join auth.users u on u.id = m.user_id;
end $$;

revoke all on function public.set_monthly_email(uuid, boolean) from public, anon, authenticated;
revoke all on function public.take_monthly_email_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.set_monthly_email(uuid, boolean) to service_role;
grant execute on function public.take_monthly_email_batch(integer, integer) to service_role;

-- As in 20261029000100_mobile_number.sql, plus the email offers tick (for the
-- customer list and its CSV).
create or replace function public.admin_users(p_search text, p_sort text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.app_settings;
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_digits text;
  v_total integer;
  v_users jsonb;
begin
  select * into s from public.app_settings where id;
  if v_search ~ '^[0-9 +()-]+$' then
    v_digits := nullif(regexp_replace(regexp_replace(v_search, '[^0-9]', '', 'g'), '^0+', ''), '');
  end if;

  with
  people as (
    select a.user_id, a.credits, a.created_at, public.free_left(a, s) as free_left, a.phone, a.offers_ok, a.email_offers_ok,
      u.email, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') as name,
      u.raw_app_meta_data ->> 'provider' as provider, u.last_sign_in_at
    from public.accounts a
    join auth.users u on u.id = a.user_id
    where v_search is null
      or strpos(lower(coalesce(u.email, '')), v_search) > 0
      or strpos(lower(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), v_search) > 0
      or (v_digits is not null and strpos(coalesce(a.phone, ''), v_digits) > 0)
  ),
  pictures as (
    select user_id,
      count(*) filter (where status = 'COMPLETED') as made,
      count(*) filter (where status = 'FAILED') as failed,
      max(created_at) as last_at,
      coalesce(sum(public.look_cost_inr(ai_usage, estimated_cost_inr, s)) filter (where status = 'COMPLETED'), 0) as cost
    from public.looks group by user_id
  ),
  money as (
    select user_id,
      coalesce(sum(amount_inr) filter (where status = 'APPROVED'), 0) as paid,
      count(*) filter (where status = 'APPROVED') as recharges,
      count(*) filter (where status = 'PENDING') as pending
    from public.recharges where user_id is not null group by user_id
  ),
  listed as (
    select p.*, coalesce(pi.made, 0) as made, coalesce(pi.failed, 0) as failed, pi.last_at,
      coalesce(pi.cost, 0) as cost, coalesce(m.paid, 0) as paid, coalesce(m.recharges, 0) as recharges,
      coalesce(m.pending, 0) as pending
    from people p
    left join pictures pi on pi.user_id = p.user_id
    left join money m on m.user_id = p.user_id
  )
  select (select count(*) from listed),
    coalesce(jsonb_agg(jsonb_build_object(
      'userId', user_id, 'email', email, 'name', name, 'provider', provider,
      'phone', phone, 'offersOk', offers_ok, 'emailOffersOk', email_offers_ok,
      'joinedAt', created_at, 'lastSignInAt', last_sign_in_at, 'lastPictureAt', last_at,
      'credits', credits, 'freeLeft', free_left,
      'paidInr', paid, 'recharges', recharges, 'pendingRecharges', pending,
      'pictures', made, 'failedPictures', failed,
      'aiCostInr', cost, 'earnedInr', paid - cost
    ) order by sort_1 desc nulls last, sort_2 desc nulls last, created_at desc), '[]'::jsonb)
  into v_total, v_users
  from (
    select r.*,
      case p_sort when 'paid' then r.paid when 'pictures' then r.made end as sort_1,
      case when p_sort = 'active' then greatest(r.last_at, r.last_sign_in_at) end as sort_2
    from listed r
    order by sort_1 desc nulls last, sort_2 desc nulls last, r.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) page;

  return jsonb_build_object('total', v_total, 'users', v_users);
end $$;

notify pgrst, 'reload schema';
