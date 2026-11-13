-- Compliance features (13 November 2026).
--
-- 1. Receipts: every approved recharge gets a receipt number (PP-<year>-000001)
--    (Consumer Protection Act 2019, s.2(47)(ix)).
-- 2. Moderation: blocked accounts, pictures taken down by the admin, and an
--    evidence hold that stops the 3-day cleanup (IT Rules 2021, rule 3(1)(c),
--    3(1)(g), 3(2)(b)); every admin action is logged.
-- 3. Deleted accounts' sign-in details kept 180 days (IT Rules 2021, rule 3(1)(h)).
-- 4. A usage log (who did what, when, from which address), kept 1 year
--    (DPDP Rules 2025, rule 8(3)); no photos in it.
-- 5. The separate "how my data is used" agreement (DPDP Rules 2025, rule 3).
-- 6. "Report a problem" on a picture, with a refund when the admin agrees.
-- 7. Complaints from anyone, signed in or not (/complaints).

-- 1. Receipts ---------------------------------------------------------------
create sequence if not exists public.receipt_seq;
alter table public.recharges add column if not exists receipt_no text unique;
-- The GSTIN, once registered (shown on receipts; empty: "not registered").
alter table public.app_settings add column if not exists gstin text;
alter table public.app_settings drop constraint if exists app_settings_gstin_check;
alter table public.app_settings add constraint app_settings_gstin_check
  check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$');

create or replace function public.assign_receipt_no()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'APPROVED' and new.receipt_no is null then
    new.receipt_no := 'PP-' || to_char(coalesce(new.reviewed_at, now()) at time zone 'Asia/Kolkata', 'YYYY') || '-'
      || lpad(nextval('public.receipt_seq')::text, 6, '0');
  end if;
  return new;
end $$;
drop trigger if exists recharges_receipt_no on public.recharges;
create trigger recharges_receipt_no before insert or update of status on public.recharges
  for each row execute function public.assign_receipt_no();

-- Receipts for recharges approved before today, in the order they were approved.
update public.recharges r set receipt_no = numbered.no
from (
  select id, 'PP-' || to_char(coalesce(reviewed_at, created_at) at time zone 'Asia/Kolkata', 'YYYY') || '-'
    || lpad(nextval('public.receipt_seq')::text, 6, '0') as no
  from (select id, reviewed_at, created_at from public.recharges where status = 'APPROVED' and receipt_no is null
        order by coalesce(reviewed_at, created_at), id) ordered
) numbered
where r.id = numbered.id;

-- 2. Moderation -------------------------------------------------------------
alter table public.accounts
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_reason text,
  -- 5. When the customer agreed to the itemised "how my data is used" notice.
  add column if not exists data_consent_at timestamptz,
  add column if not exists data_consent_version text;
alter table public.accounts drop constraint if exists accounts_blocked_reason_check;
alter table public.accounts add constraint accounts_blocked_reason_check check (coalesce(length(blocked_reason), 0) <= 300);

alter table public.looks
  add column if not exists removed_at timestamptz,
  add column if not exists removed_reason text,
  -- 6. Report a problem.
  add column if not exists problem_reason text,
  add column if not exists problem_note text,
  add column if not exists problem_reported_at timestamptz,
  add column if not exists problem_status text,
  add column if not exists problem_resolved_at timestamptz,
  add column if not exists problem_resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists problem_reply text;
alter table public.looks drop constraint if exists looks_problem_check;
alter table public.looks add constraint looks_problem_check check (
  (problem_status is null or problem_status in ('OPEN', 'REFUNDED', 'DECLINED'))
  and (problem_reason is null or problem_reason in ('FACE_CHANGED', 'WRONG_GARMENT', 'DISTORTED', 'OTHER'))
  and coalesce(length(problem_note), 0) <= 500 and coalesce(length(problem_reply), 0) <= 500
  and coalesce(length(removed_reason), 0) <= 300
);
create index if not exists looks_problem_open_idx on public.looks (problem_reported_at) where problem_status = 'OPEN';

-- Photos and pictures under hold are not deleted by the 3-day cleanup until then.
alter table public.try_on_batches
  add column if not exists hold_until timestamptz,
  add column if not exists hold_reason text;

create table if not exists public.moderation_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  user_id uuid,
  look_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  constraint moderation_log_check check (action in ('BLOCK', 'UNBLOCK', 'TAKE_DOWN', 'HOLD', 'RELEASE_HOLD', 'PROBLEM_REFUNDED', 'PROBLEM_DECLINED', 'COMPLAINT_UPDATED')
    and coalesce(length(reason), 0) <= 500)
);

-- A blocked account cannot make pictures (whatever route is used).
create or replace function public.refuse_blocked_looks()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.accounts where user_id = new.user_id and blocked_at is not null) then
    raise exception 'ACCOUNT_BLOCKED';
  end if;
  return new;
end $$;
drop trigger if exists looks_refuse_blocked on public.looks;
create trigger looks_refuse_blocked before insert on public.looks
  for each row execute function public.refuse_blocked_looks();

-- 3. Deleted accounts' sign-in details --------------------------------------
create table if not exists public.deleted_registrations (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  email text,
  phone text,
  name text,
  signed_up_at timestamptz,
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_registrations_deleted_idx on public.deleted_registrations (deleted_at);

-- 4. Usage log --------------------------------------------------------------
create table if not exists public.processing_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  event text not null,
  ref_id uuid,
  ip text,
  created_at timestamptz not null default now(),
  constraint processing_log_check check (length(event) <= 40 and coalesce(length(ip), 0) <= 60)
);
create index if not exists processing_log_user_idx on public.processing_log (user_id, created_at desc);
create index if not exists processing_log_created_idx on public.processing_log (created_at);

-- 7. Complaints -------------------------------------------------------------
create table if not exists public.grievances (
  id uuid primary key default gen_random_uuid(),
  ticket text not null unique default ('PPC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  contact text not null,
  category text not null,
  picture_id text,
  details text not null,
  urgent boolean not null default false,
  status text not null default 'OPEN',
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  handled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint grievances_check check (
    category in ('MY_PHOTO_WITHOUT_CONSENT', 'INTIMATE_OR_SEXUAL', 'IMPERSONATION', 'CHILD', 'PRIVACY_REQUEST', 'PAYMENT', 'PICTURE_QUALITY', 'OTHER')
    and status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')
    and length(name) between 1 and 100 and length(contact) between 3 and 200
    and coalesce(length(picture_id), 0) <= 60 and length(details) between 5 and 3000
    and coalesce(length(resolution), 0) <= 2000
  )
);
create index if not exists grievances_open_idx on public.grievances (created_at) where status <> 'RESOLVED';

alter table public.moderation_log enable row level security;
alter table public.deleted_registrations enable row level security;
alter table public.processing_log enable row level security;
alter table public.grievances enable row level security;
revoke all on table public.moderation_log, public.deleted_registrations, public.processing_log, public.grievances from public, anon, authenticated;
grant select, insert, update, delete on table public.moderation_log, public.deleted_registrations, public.processing_log, public.grievances to service_role;
revoke all on sequence public.receipt_seq from public, anon, authenticated;
grant usage, select on sequence public.receipt_seq to service_role;

-- 6. Report a problem: the customer, within the 3 days the picture exists.
--    The try is kept (held) up to 7 days so the admin can look at it.
create or replace function public.report_look_problem(p_user_id uuid, p_look_id uuid, p_reason text, p_note text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_look public.looks;
  v_open integer;
begin
  select * into v_look from public.looks where id = p_look_id and user_id = p_user_id for update;
  if not found or v_look.removed_at is not null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_look.status <> 'COMPLETED' then return jsonb_build_object('error', 'NOT_FINISHED'); end if;
  if v_look.refunded_at is not null then return jsonb_build_object('error', 'ALREADY_REFUNDED'); end if;
  if v_look.problem_status is not null then return jsonb_build_object('error', 'ALREADY_REPORTED'); end if;
  if v_look.created_at < now() - interval '3 days' then return jsonb_build_object('error', 'TOO_LATE'); end if;
  if p_reason is null or p_reason not in ('FACE_CHANGED', 'WRONG_GARMENT', 'DISTORTED', 'OTHER') then
    return jsonb_build_object('error', 'INVALID_REASON');
  end if;
  select count(*) into v_open from public.looks
    where user_id = p_user_id and problem_reported_at > now() - interval '30 days';
  if v_open >= 10 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  update public.looks set problem_reason = p_reason, problem_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    problem_reported_at = now(), problem_status = 'OPEN'
    where id = p_look_id;
  update public.try_on_batches set hold_until = greatest(coalesce(hold_until, now()), now() + interval '7 days'),
    hold_reason = coalesce(hold_reason, 'Problem report')
    where id = v_look.batch_id;
  return jsonb_build_object('reported', true);
end $$;

-- The admin's answer: refund (credits back: paid ones as paid, free ones as
-- this month's free credits) or decline, with a short reply to the customer.
create or replace function public.resolve_look_problem(p_admin uuid, p_look_id uuid, p_refund boolean, p_reply text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_look public.looks;
  v_account public.accounts;
  v_free_back integer := 0;
begin
  select * into v_look from public.looks where id = p_look_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  v_account := public.lock_account(v_look.user_id);
  select * into v_look from public.looks where id = p_look_id for update;
  if v_look.problem_status is distinct from 'OPEN' then return jsonb_build_object('error', 'NOT_OPEN'); end if;
  if p_refund and v_look.refunded_at is null then
    v_free_back := least(v_look.free_credits_used, v_account.free_used);
    update public.accounts set credits = credits + v_look.paid_credits_used, free_used = free_used - v_free_back, updated_at = now()
      where user_id = v_look.user_id returning * into v_account;
    insert into public.credit_ledger (user_id, kind, credits, free_credits, balance_after, look_id, reason, actor_id)
    values (v_look.user_id, 'REFUND', v_look.paid_credits_used, v_free_back, v_account.credits, p_look_id, 'Problem report accepted', p_admin);
  end if;
  update public.looks set problem_status = case when p_refund then 'REFUNDED' else 'DECLINED' end,
    problem_resolved_at = now(), problem_resolved_by = p_admin,
    problem_reply = nullif(left(btrim(coalesce(p_reply, '')), 500), ''),
    refunded_at = case when p_refund then coalesce(refunded_at, now()) else refunded_at end
    where id = p_look_id;
  -- Released for the normal cleanup, unless held for another reason.
  update public.try_on_batches set hold_until = null, hold_reason = null
    where id = v_look.batch_id and hold_reason = 'Problem report';
  insert into public.moderation_log (admin_id, action, user_id, look_id, reason)
  values (p_admin, case when p_refund then 'PROBLEM_REFUNDED' else 'PROBLEM_DECLINED' end, v_look.user_id, p_look_id, p_reply);
  return jsonb_build_object('resolved', true, 'refunded', p_refund);
end $$;

-- Retention: deleted accounts' sign-in details after 180 days, the usage log
-- after 1 year, the moderation log after 3 years, resolved complaints after 3
-- years (the limitation period for a consumer complaint is 2 years).
create or replace function public.purge_compliance_records()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_registrations integer;
  v_log integer;
begin
  delete from public.deleted_registrations where deleted_at < now() - interval '180 days';
  get diagnostics v_registrations = row_count;
  delete from public.processing_log where created_at < now() - interval '1 year';
  get diagnostics v_log = row_count;
  delete from public.moderation_log where created_at < now() - interval '3 years';
  delete from public.grievances where status = 'RESOLVED' and resolved_at < now() - interval '3 years';
  return jsonb_build_object('registrations', v_registrations, 'log', v_log);
end $$;

-- As in 20261112000100_engagement.sql, plus whether the account is blocked and
-- when it agreed to the itemised data notice.
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
    'completedPictures', (select count(*) from public.looks l where l.user_id = p_account.user_id and l.status = 'COMPLETED'),
    'blocked', p_account.blocked_at is not null,
    'blockedReason', p_account.blocked_reason,
    'dataConsentAt', p_account.data_consent_at
  )
  from public.app_settings s where s.id
$$;

revoke all on function public.assign_receipt_no() from public, anon, authenticated;
revoke all on function public.refuse_blocked_looks() from public, anon, authenticated;
revoke all on function public.report_look_problem(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.resolve_look_problem(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.purge_compliance_records() from public, anon, authenticated;
grant execute on function public.report_look_problem(uuid, uuid, text, text) to service_role;
grant execute on function public.resolve_look_problem(uuid, uuid, boolean, text) to service_role;
grant execute on function public.purge_compliance_records() to service_role;

notify pgrst, 'reload schema';
