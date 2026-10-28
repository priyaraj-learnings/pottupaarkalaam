-- Fix: the UPI ID check used {2,256}, but Postgres regular expressions allow at
-- most 255 repeats, so saving any UPI ID failed with "invalid regular
-- expression: invalid repetition count(s)". Same rules, with the UPI ID's
-- length checked separately.

alter table public.app_settings drop constraint if exists app_settings_values_check;
alter table public.app_settings add constraint app_settings_values_check check (
  free_credits_per_month between 0 and 100
  and standard_rate_inr between 1 and 1000
  and bulk_rate_inr between 1 and 1000
  and bulk_min_recharge_inr between 1 and 1000000
  and min_recharge_inr between 1 and 1000000
  and max_recharge_inr between min_recharge_inr and 1000000
  and (upi_id is null or (length(upi_id) <= 256 and upi_id ~ '^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,64}$'))
  and (payee_name is null or length(payee_name) <= 100)
  and (support_contact is null or length(support_contact) <= 200)
);
