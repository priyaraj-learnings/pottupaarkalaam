-- Security fixes (review of 13 November 2026).
--
-- 1. Trusted bank senders for automatic payment approval can be set in
--    /admin Settings (payment_senders), as well as in the PAYMENT_SMS_SENDERS
--    environment variable. With neither set, bank alerts no longer approve
--    recharges automatically (lib/bankAlert.ts senderAllowed).
-- 2. Unsubscribe links are signed with their own secret, made on first use.
-- 3. A failed try never turns free credits into paid credits.
-- 4. Bank alert messages are cleaned up (deleted accounts, old unmatched ones).
-- 5. Consent records for partner photos and sample models.

alter table public.app_settings
  add column if not exists payment_senders text,
  add column if not exists unsubscribe_secret text;
alter table public.app_settings drop constraint if exists app_settings_security_check;
alter table public.app_settings add constraint app_settings_security_check check (
  coalesce(length(payment_senders), 0) <= 500 and coalesce(length(unsubscribe_secret), 0) <= 200
);

-- As in 20261026000100_pottupaarkalaam.sql, but free credits are only ever
-- given back as free credits of the current month.
create or replace function public.fail_look(p_look_id uuid, p_message text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_look public.looks;
  v_account public.accounts;
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  v_free_back integer;
  v_paid_back integer;
begin
  select * into v_look from public.looks where id = p_look_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  -- Account first, then the look (the same order as create_looks).
  v_account := public.lock_account(v_look.user_id);
  select * into v_look from public.looks where id = p_look_id for update;

  if v_look.status in ('QUEUED', 'PROCESSING') then
    update public.looks
      set status = 'FAILED', error_message = left(coalesce(p_message, 'The try-on could not be made.'), 500),
          completed_at = now()
      where id = p_look_id returning * into v_look;
  end if;
  if v_look.status <> 'FAILED' or v_look.refunded_at is not null then
    return jsonb_build_object('status', v_look.status, 'refunded', v_look.refunded_at is not null);
  end if;

  -- Free credits come back as free credits of this month (never as paid
  -- credits: a try started just before the month ended must not turn free
  -- credits into paid ones), up to what was used this month.
  v_free_back := least(v_look.free_credits_used, v_account.free_used);
  v_paid_back := v_look.paid_credits_used;

  update public.accounts
    set credits = credits + v_paid_back, free_used = free_used - v_free_back, updated_at = now()
    where user_id = v_look.user_id returning * into v_account;
  update public.looks set refunded_at = now() where id = p_look_id;
  insert into public.credit_ledger (user_id, kind, credits, free_credits, balance_after, look_id, reason)
  values (v_look.user_id, 'REFUND', v_paid_back, v_free_back, v_account.credits, p_look_id, 'Try-on failed');

  return jsonb_build_object('status', 'FAILED', 'refunded', true);
end $$;

revoke all on function public.fail_look(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_look(uuid, text) to service_role;

-- 4. Bank alert messages carry the payer's name. When an account is deleted,
--    its matched alerts keep only the UTR, amount and date (the Privacy Policy
--    says payments are kept without the person's name). Alerts that never
--    matched a recharge (often not our customers) lose their message after 90
--    days; their UTR and amount stay so a late recharge can still be checked.
create or replace function public.forget_payment_alerts(p_user_id uuid)
returns integer
language sql security definer set search_path = public, pg_temp as $$
  with changed as (
    update public.payment_alerts a set message = '', sender = null
    from public.recharges r
    where r.user_id = p_user_id and a.recharge_id = r.id and (a.message <> '' or a.sender is not null)
    returning a.id
  )
  select count(*)::integer from changed
$$;

create or replace function public.purge_old_payment_alerts()
returns integer
language sql security definer set search_path = public, pg_temp as $$
  with changed as (
    update public.payment_alerts set message = '', sender = null
    where recharge_id is null and received_at < now() - interval '90 days' and (message <> '' or sender is not null)
    returning id
  )
  select count(*)::integer from changed
$$;

-- 5. Consent records: when a couple picture's partner photo was agreed to, and
--    when the admin confirmed a sample model's written agreement.
alter table public.try_on_batches add column if not exists partner_consent_at timestamptz;
alter table public.sample_models add column if not exists consented_at timestamptz not null default now();

revoke all on function public.forget_payment_alerts(uuid) from public, anon, authenticated;
revoke all on function public.purge_old_payment_alerts() from public, anon, authenticated;
grant execute on function public.forget_payment_alerts(uuid) to service_role;
grant execute on function public.purge_old_payment_alerts() to service_role;

notify pgrst, 'reload schema';
