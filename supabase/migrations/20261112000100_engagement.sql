-- Engagement: picture-ready notifications, occasion backgrounds, a starter
-- pack, sample models, shop QR posters and the Google review link.

-- 1. Picture-ready notifications (Web Push). The app makes its own key pair
--    (VAPID) on first use and keeps it here; only the server reads the private
--    key. A notification carries no data: the phone shows "your picture is
--    ready" and opens the app.
alter table public.app_settings
  add column if not exists vapid_public_key text,
  add column if not exists vapid_private_key text,
  -- 6. Starter pack: one first recharge of this amount for these credits
  --    (0: off), allowed below the smallest recharge.
  add column if not exists starter_pack_inr integer not null default 0,
  add column if not exists starter_pack_credits integer not null default 0,
  -- 9. "Rate us on Google" link (the Google Business Profile review link).
  add column if not exists google_review_url text;
alter table public.app_settings drop constraint if exists app_settings_engagement_check;
alter table public.app_settings add constraint app_settings_engagement_check check (
  starter_pack_inr between 0 and 100000 and starter_pack_credits between 0 and 1000
  and coalesce(length(google_review_url), 0) <= 300
  and coalesce(length(vapid_public_key), 0) <= 200 and coalesce(length(vapid_private_key), 0) <= 400
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_check check (length(endpoint) <= 1000 and endpoint like 'https://%')
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Set once per try, when its last picture is finished (one notification per try).
alter table public.try_on_batches
  add column if not exists ready_notified_at timestamptz,
  -- 7. The occasion background chosen for the try (null: the photo's own).
  add column if not exists background text;
alter table public.try_on_batches drop constraint if exists try_on_batches_background_check;
alter table public.try_on_batches add constraint try_on_batches_background_check
  check (background is null or background in ('WEDDING', 'TEMPLE', 'DEEPAVALI', 'PONGAL', 'STUDIO', 'GARDEN'));

-- 6. Starter pack recharges are marked.
alter table public.recharges add column if not exists starter boolean not null default false;

-- 5. Sample models: photos the admin adds (with the person's agreement), which
--    customers can use instead of their own photo. Public, like the website.
create table if not exists public.sample_models (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  label text not null,
  gender text not null default 'WOMAN',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint sample_models_check check (length(label) between 1 and 60 and gender in ('WOMAN', 'MAN'))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sample-models', 'sample-models', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 8. Shop QR posters: each shop has a code like a customer's invite code
--    (pp.inaivuit.com/?ref=CODE). New customers who come from a shop's poster
--    are counted for that shop. No reward: it shows which shops bring customers.
create table if not exists public.shops (
  code text primary key default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  name text not null,
  area text,
  created_at timestamptz not null default now(),
  constraint shops_check check (code ~ '^[0-9A-F]{8}$' and length(name) between 1 and 100 and coalesce(length(area), 0) <= 100)
);
create table if not exists public.shop_signups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shop_code text not null references public.shops(code) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists shop_signups_shop_idx on public.shop_signups (shop_code);

alter table public.push_subscriptions enable row level security;
alter table public.sample_models enable row level security;
alter table public.shops enable row level security;
alter table public.shop_signups enable row level security;
revoke all on table public.push_subscriptions, public.sample_models, public.shops, public.shop_signups from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions, public.sample_models, public.shops, public.shop_signups to service_role;

-- As in 20261026000100_pottupaarkalaam.sql, plus the starter pack.
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
  v_starter boolean;
  v_credits integer;
begin
  if p_utr is null or p_utr !~ '^[0-9]{12}$' then
    return jsonb_build_object('error', 'INVALID_UTR');
  end if;
  select * into v_settings from public.app_settings where id;
  -- The starter pack: once per account (no earlier recharge waiting or added).
  v_starter := v_settings.starter_pack_inr > 0 and v_settings.starter_pack_credits > 0
    and p_amount_inr = v_settings.starter_pack_inr
    and not exists (select 1 from public.recharges where user_id = p_user_id and status in ('PENDING', 'APPROVED'));
  if v_starter then
    v_rate := ceil(v_settings.starter_pack_inr::numeric / v_settings.starter_pack_credits)::integer;
    v_credits := v_settings.starter_pack_credits;
  else
    if p_amount_inr is null or p_amount_inr < v_settings.min_recharge_inr or p_amount_inr > v_settings.max_recharge_inr then
      return jsonb_build_object('error', 'INVALID_AMOUNT', 'min', v_settings.min_recharge_inr, 'max', v_settings.max_recharge_inr);
    end if;
    v_rate := case when p_amount_inr >= v_settings.bulk_min_recharge_inr then v_settings.bulk_rate_inr else v_settings.standard_rate_inr end;
    if p_amount_inr % v_rate <> 0 then
      return jsonb_build_object('error', 'INVALID_AMOUNT_STEP', 'step', v_rate);
    end if;
    v_credits := p_amount_inr / v_rate;
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

  insert into public.recharges (user_id, user_email, amount_inr, utr, rate_inr, credits, starter)
  values (p_user_id, left(p_email, 320), p_amount_inr, p_utr, v_rate, v_credits, v_starter)
  returning * into v_recharge;

  select * into v_alert from public.payment_alerts where utr = p_utr and recharge_id is null for update;
  if found and v_alert.amount_inr = p_amount_inr then
    perform public.credit_recharge(v_recharge, null, true, v_alert.id);
    select * into v_recharge from public.recharges where id = v_recharge.id;
  end if;

  return jsonb_build_object('recharge', to_jsonb(v_recharge) - 'user_email');
end $$;

-- As in 20261110000100_growth.sql, plus shop codes: a new account from a shop's
-- poster is counted for the shop.
create or replace function public.claim_referral(p_user_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_referrer uuid;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_shop public.shops;
begin
  v_account := public.lock_account(p_user_id);
  if exists (select 1 from public.referrals where referee_user_id = p_user_id) then
    return public.settle_referral(p_user_id);
  end if;
  if v_account.created_at < now() - interval '7 days' then
    return jsonb_build_object('rewarded', false, 'reason', 'NOT_NEW');
  end if;
  select * into v_shop from public.shops where code = v_code;
  if found then
    insert into public.shop_signups (user_id, shop_code) values (p_user_id, v_shop.code) on conflict (user_id) do nothing;
    return jsonb_build_object('rewarded', false, 'reason', 'SHOP', 'shop', v_shop.name);
  end if;
  select user_id into v_referrer from public.accounts where referral_code = v_code;
  if v_referrer is null then return jsonb_build_object('rewarded', false, 'reason', 'UNKNOWN_CODE'); end if;
  if v_referrer = p_user_id then return jsonb_build_object('rewarded', false, 'reason', 'OWN_CODE'); end if;
  insert into public.referrals (referee_user_id, referrer_user_id) values (p_user_id, v_referrer);
  return public.settle_referral(p_user_id);
end $$;

-- 8. The shops report: customers who joined from each shop's poster, how many
--    verified their number, made pictures and paid.
create or replace function public.admin_shops()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', s.code, 'name', s.name, 'area', s.area, 'createdAt', s.created_at,
    'signups', (select count(*) from public.shop_signups x where x.shop_code = s.code),
    'verified', (select count(*) from public.shop_signups x join public.accounts a on a.user_id = x.user_id
      where x.shop_code = s.code and a.phone_verified_at is not null),
    'withPictures', (select count(distinct x.user_id) from public.shop_signups x join public.looks l on l.user_id = x.user_id
      where x.shop_code = s.code and l.status = 'COMPLETED'),
    'paidInr', (select coalesce(sum(r.amount_inr), 0) from public.shop_signups x join public.recharges r on r.user_id = x.user_id
      where x.shop_code = s.code and r.status = 'APPROVED')
  ) order by s.created_at desc), '[]'::jsonb)
  from public.shops s
$$;

-- As in 20261110000100_growth.sql, plus whether the starter pack is still open
-- to the account and how many pictures it has made (for the "Rate us" card).
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
    'friendsJoined', (select count(*) from public.referrals r where r.referrer_user_id = p_account.user_id and r.rewarded_at is not null),
    'starterAvailable', not exists (select 1 from public.recharges r where r.user_id = p_account.user_id and r.status in ('PENDING', 'APPROVED')),
    'completedPictures', (select count(*) from public.looks l where l.user_id = p_account.user_id and l.status = 'COMPLETED')
  )
  from public.app_settings s where s.id
$$;

revoke all on function public.claim_referral(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_shops() from public, anon, authenticated;
grant execute on function public.claim_referral(uuid, text) to service_role;
grant execute on function public.admin_shops() to service_role;

notify pgrst, 'reload schema';
