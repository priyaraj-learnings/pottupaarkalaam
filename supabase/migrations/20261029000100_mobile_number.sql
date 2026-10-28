-- Customers' mobile numbers. Optional: asked once after sign-in (again 30 days
-- after "Not now"), and changed or removed from the account menu. offers_ok
-- records the separate consent to hear about offers on that number.

alter table public.accounts
  add column if not exists phone text,
  add column if not exists phone_updated_at timestamptz,
  add column if not exists phone_asked_at timestamptz,
  add column if not exists offers_ok boolean not null default false,
  add column if not exists offers_ok_at timestamptz;

alter table public.accounts drop constraint if exists accounts_phone_check;
alter table public.accounts add constraint accounts_phone_check
  check ((phone is null or phone ~ '^\+91[6-9][0-9]{9}$') and (phone is not null or not offers_ok));

create index if not exists accounts_phone_idx on public.accounts (phone) where phone is not null;

create or replace function public.account_json(p_account public.accounts)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'credits', p_account.credits,
    'freeCreditsPerMonth', s.free_credits_per_month,
    'freeLeft', greatest(0, s.free_credits_per_month - p_account.free_used),
    'termsVersion', p_account.terms_version,
    'termsAcceptedAt', p_account.terms_accepted_at,
    'phone', p_account.phone,
    'offersOk', p_account.offers_ok,
    'phoneAskedAt', p_account.phone_asked_at
  )
  from public.app_settings s where s.id
$$;

-- Saves the mobile number (+91 and 10 digits, lib/rules.ts normalizeMobile),
-- or removes it when p_phone is null. Offers need a number.
create or replace function public.save_phone(p_user_id uuid, p_phone text, p_offers_ok boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
  v_offers boolean := p_phone is not null and coalesce(p_offers_ok, false);
begin
  if p_phone is not null and p_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  v_account := public.lock_account(p_user_id);
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

-- "Not now".
create or replace function public.skip_phone(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.accounts;
begin
  v_account := public.lock_account(p_user_id);
  update public.accounts set phone_asked_at = now(), updated_at = now()
  where user_id = p_user_id returning * into v_account;
  return public.account_json(v_account);
end $$;

-- As in 20261028000100_admin_analytics.sql, plus the mobile number: shown,
-- and searchable by its digits.
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
    select a.user_id, a.credits, a.created_at, public.free_left(a, s) as free_left, a.phone, a.offers_ok,
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
      'phone', phone, 'offersOk', offers_ok,
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

-- As in 20261028000100_admin_analytics.sql, plus the mobile number.
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
      'phone', a.phone, 'offersOk', a.offers_ok, 'phoneUpdatedAt', a.phone_updated_at,
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

revoke all on function public.save_phone(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.skip_phone(uuid) from public, anon, authenticated;
grant execute on function public.save_phone(uuid, text, boolean) to service_role;
grant execute on function public.skip_phone(uuid) to service_role;
