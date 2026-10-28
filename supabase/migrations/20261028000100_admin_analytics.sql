-- Admin analytics (/admin): money received, AI cost, earnings, customers.
--
-- * The AI cost of each picture is worked out from the tokens OpenAI reported
--   for it (looks.ai_usage) and the rates in app_settings, which the admin can
--   edit to match https://openai.com/api/pricing. Correcting a rate corrects
--   every report, past pictures included.
-- * admin_analytics: the numbers, the money-per-day series and the popular
--   categories for a period.
-- * admin_users / admin_user_detail: every customer with what they paid, used
--   and cost, and one customer's recharges, pictures and credit history.
--
-- Apply to the UAT database first, then production, BEFORE deploying the code
-- that uses it. Additive only; service_role only.

alter table public.app_settings
  add column if not exists usd_to_inr numeric(8,2) not null default 88,
  add column if not exists ai_text_input_usd_per_million numeric(10,4) not null default 5,
  add column if not exists ai_image_input_usd_per_million numeric(10,4) not null default 8,
  add column if not exists ai_output_usd_per_million numeric(10,4) not null default 30;

alter table public.app_settings drop constraint if exists app_settings_ai_rates_check;
alter table public.app_settings add constraint app_settings_ai_rates_check check (
  usd_to_inr between 1 and 1000
  and ai_text_input_usd_per_million between 0 and 10000
  and ai_image_input_usd_per_million between 0 and 10000
  and ai_output_usd_per_million between 0 and 10000
);

-- The AI cost of one picture in rupees. Pictures made before token counts were
-- kept fall back to the estimate saved with them.
create or replace function public.look_cost_inr(p_usage jsonb, p_estimate numeric, p_settings public.app_settings)
returns numeric
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_usage is null or jsonb_typeof(p_usage) <> 'object' then coalesce(p_estimate, 0)
    else (
      coalesce((p_usage ->> 'inputTextTokens')::numeric, 0) * p_settings.ai_text_input_usd_per_million
      + coalesce((p_usage ->> 'inputImageTokens')::numeric, 0) * p_settings.ai_image_input_usd_per_million
      + coalesce((p_usage ->> 'outputTokens')::numeric, 0) * p_settings.ai_output_usd_per_million
    ) / 1000000 * p_settings.usd_to_inr
  end
$$;

-- This month's free credits left for an account (a new month resets them).
create or replace function public.free_left(p_account public.accounts, p_settings public.app_settings)
returns integer
language sql stable set search_path = public, pg_temp as $$
  select case
    when p_account.free_month = date_trunc('month', now() at time zone 'Asia/Kolkata')::date
      then greatest(0, p_settings.free_credits_per_month - p_account.free_used)
    else p_settings.free_credits_per_month
  end
$$;

-- The numbers for [p_from, p_to). Days and months are India time. Periods up to
-- 62 days are shown per day, longer ones per month.
create or replace function public.admin_analytics(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.app_settings;
  v_unit text;
  v_lifetime_received numeric;
  v_lifetime_credits numeric;
  v_price numeric;
  v_totals jsonb;
  v_series jsonb;
  v_categories jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'INVALID_INPUT';
  end if;
  select * into s from public.app_settings where id;
  v_unit := case when p_to - p_from <= interval '62 days' then 'day' else 'month' end;

  -- What a paid credit was sold for, on average, over all time.
  select coalesce(sum(amount_inr), 0), coalesce(sum(credits), 0)
    into v_lifetime_received, v_lifetime_credits
    from public.recharges where status = 'APPROVED';
  v_price := case when v_lifetime_credits > 0 then v_lifetime_received / v_lifetime_credits else s.standard_rate_inr end;

  with
  paid as (
    select * from public.recharges where status = 'APPROVED' and reviewed_at >= p_from and reviewed_at < p_to
  ),
  made as (
    select l.*, public.look_cost_inr(l.ai_usage, l.estimated_cost_inr, s) as cost
    from public.looks l
    where l.status = 'COMPLETED' and l.created_at >= p_from and l.created_at < p_to
  )
  select jsonb_build_object(
    'receivedInr', (select coalesce(sum(amount_inr), 0) from paid),
    'recharges', (select count(*) from paid),
    'autoVerifiedRecharges', (select count(*) from paid where auto_verified),
    'creditsSold', (select coalesce(sum(credits), 0) from paid),
    'aiCostInr', (select coalesce(sum(cost), 0) from made),
    'freeAiCostInr', (select coalesce(sum(cost * free_credits_used / credits), 0) from made),
    'pictures', (select count(*) from made),
    'pairPictures', (select count(*) from made where kind = 'PAIR'),
    'failedPictures', (select count(*) from public.looks
      where status = 'FAILED' and created_at >= p_from and created_at < p_to),
    'freeCreditsUsed', (select coalesce(sum(free_credits_used), 0) from made),
    'paidCreditsUsed', (select coalesce(sum(paid_credits_used), 0) from made),
    'valueOfCreditsUsedInr', (select coalesce(sum(paid_credits_used), 0) * v_price from made),
    'averagePricePerCreditInr', v_price,
    'customers', (select count(*) from public.accounts),
    'newCustomers', (select count(*) from public.accounts where created_at >= p_from and created_at < p_to),
    'activeCustomers', (select count(distinct user_id) from public.looks where created_at >= p_from and created_at < p_to),
    'payingCustomers', (select count(distinct user_id) from paid),
    'payingCustomersEver', (select count(distinct user_id) from public.recharges where status = 'APPROVED'),
    'unusedPaidCredits', (select coalesce(sum(credits), 0) from public.accounts),
    'unusedCreditsValueInr', (select coalesce(sum(credits), 0) from public.accounts) * v_price,
    'pendingRecharges', (select count(*) from public.recharges where status = 'PENDING'),
    'pendingInr', (select coalesce(sum(amount_inr), 0) from public.recharges where status = 'PENDING'),
    'unmatchedAlerts', (select count(*) from public.payment_alerts where recharge_id is null),
    'receivedEverInr', v_lifetime_received
  ) into v_totals;

  with
  buckets as (
    select generate_series(
      date_trunc(v_unit, p_from at time zone 'Asia/Kolkata'),
      date_trunc(v_unit, (p_to - interval '1 second') at time zone 'Asia/Kolkata'),
      ('1 ' || v_unit)::interval
    ) as bucket
  ),
  money as (
    select date_trunc(v_unit, reviewed_at at time zone 'Asia/Kolkata') as bucket, sum(amount_inr) as received
    from public.recharges where status = 'APPROVED' and reviewed_at >= p_from and reviewed_at < p_to
    group by 1
  ),
  usage as (
    select date_trunc(v_unit, created_at at time zone 'Asia/Kolkata') as bucket,
      count(*) as pictures,
      sum(public.look_cost_inr(ai_usage, estimated_cost_inr, s)) as cost
    from public.looks where status = 'COMPLETED' and created_at >= p_from and created_at < p_to
    group by 1
  ),
  joined as (
    select date_trunc(v_unit, created_at at time zone 'Asia/Kolkata') as bucket, count(*) as customers
    from public.accounts where created_at >= p_from and created_at < p_to
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
      'receivedInr', coalesce(m.received, 0),
      'aiCostInr', coalesce(u.cost, 0),
      'pictures', coalesce(u.pictures, 0),
      'newCustomers', coalesce(j.customers, 0)
    ) order by b.bucket), '[]'::jsonb)
  into v_series
  from buckets b
  left join money m on m.bucket = b.bucket
  left join usage u on u.bucket = b.bucket
  left join joined j on j.bucket = b.bucket;

  -- Each picture counts once, under its main garment.
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'pictures', pictures,
      'fabric', fabric, 'stitched', stitched) order by pictures desc, category), '[]'::jsonb)
  into v_categories
  from (
    select garments -> 0 ->> 'category' as category,
      count(*) as pictures,
      count(*) filter (where garments -> 0 ->> 'source' = 'FABRIC') as fabric,
      count(*) filter (where garments -> 0 ->> 'source' = 'STITCHED') as stitched
    from public.looks
    where status = 'COMPLETED' and created_at >= p_from and created_at < p_to
    group by 1
  ) c;

  return jsonb_build_object('unit', v_unit, 'totals', v_totals, 'series', v_series, 'categories', v_categories);
end $$;

-- Customers with what they paid, used and cost. p_sort: 'recent' (newest
-- first), 'active', 'paid' or 'pictures'. p_search matches the email or name.
create or replace function public.admin_users(p_search text, p_sort text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.app_settings;
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_total integer;
  v_users jsonb;
begin
  select * into s from public.app_settings where id;

  with
  people as (
    select a.user_id, a.credits, a.created_at, public.free_left(a, s) as free_left,
      u.email, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') as name,
      u.raw_app_meta_data ->> 'provider' as provider, u.last_sign_in_at
    from public.accounts a
    join auth.users u on u.id = a.user_id
    where v_search is null
      or strpos(lower(coalesce(u.email, '')), v_search) > 0
      or strpos(lower(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), v_search) > 0
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

-- One customer: their account, recharges, pictures and credit history (the
-- latest 100 of each). NULL when they have no account.
create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.app_settings;
  a public.accounts;
  u auth.users;
begin
  select * into s from public.app_settings where id;
  select * into a from public.accounts where user_id = p_user_id;
  if not found then return null; end if;
  select * into u from auth.users where id = p_user_id;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'userId', a.user_id, 'email', u.email,
      'name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
      'provider', u.raw_app_meta_data ->> 'provider',
      'joinedAt', a.created_at, 'lastSignInAt', u.last_sign_in_at,
      'credits', a.credits, 'freeLeft', public.free_left(a, s), 'termsAcceptedAt', a.terms_accepted_at
    ),
    'totals', jsonb_build_object(
      'paidInr', (select coalesce(sum(amount_inr), 0) from public.recharges where user_id = p_user_id and status = 'APPROVED'),
      'pictures', (select count(*) from public.looks where user_id = p_user_id and status = 'COMPLETED'),
      'aiCostInr', (select coalesce(sum(public.look_cost_inr(ai_usage, estimated_cost_inr, s)), 0)
        from public.looks where user_id = p_user_id and status = 'COMPLETED')
    ),
    'recharges', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'amountInr', amount_inr, 'credits', credits, 'rateInr', rate_inr, 'utr', utr,
        'status', status, 'autoVerified', auto_verified, 'createdAt', created_at,
        'reviewedAt', reviewed_at, 'rejectionReason', rejection_reason
      ) order by created_at desc), '[]'::jsonb)
      from (select * from public.recharges where user_id = p_user_id order by created_at desc limit 100) r),
    'pictures', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'createdAt', created_at, 'kind', kind, 'garments', garments, 'credits', credits,
        'freeCreditsUsed', free_credits_used, 'paidCreditsUsed', paid_credits_used, 'status', status,
        'aiCostInr', case when status = 'COMPLETED' then public.look_cost_inr(ai_usage, estimated_cost_inr, s) else 0 end,
        'error', error_message, 'refunded', refunded_at is not null
      ) order by created_at desc), '[]'::jsonb)
      from (select * from public.looks where user_id = p_user_id order by created_at desc limit 100) l),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', kind, 'credits', credits, 'freeCredits', free_credits, 'balanceAfter', balance_after,
        'reason', reason, 'createdAt', created_at
      ) order by created_at desc), '[]'::jsonb)
      from (select * from public.credit_ledger where user_id = p_user_id order by created_at desc limit 100) g)
  );
end $$;

revoke all on function public.look_cost_inr(jsonb, numeric, public.app_settings) from public, anon, authenticated;
revoke all on function public.free_left(public.accounts, public.app_settings) from public, anon, authenticated;
revoke all on function public.admin_analytics(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_users(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_user_detail(uuid) from public, anon, authenticated;

grant execute on function public.admin_analytics(timestamptz, timestamptz) to service_role;
grant execute on function public.admin_users(text, text, integer, integer) to service_role;
grant execute on function public.admin_user_detail(uuid) to service_role;
