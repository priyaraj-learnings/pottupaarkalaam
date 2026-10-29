-- Sign-in with a mobile number through the admin's MSG91 OTP widget, set in
-- /admin Settings. The widget ID and token are public (the browser loads the
-- widget with them); the auth key is secret: only the server reads it, to
-- confirm each sign-in with MSG91. app_settings stays service_role only.

alter table public.app_settings
  add column if not exists msg91_widget_id text,
  add column if not exists msg91_token_auth text,
  add column if not exists msg91_auth_key text;

alter table public.app_settings drop constraint if exists app_settings_msg91_check;
alter table public.app_settings add constraint app_settings_msg91_check check (
  coalesce(length(msg91_widget_id), 0) <= 100
  and coalesce(length(msg91_token_auth), 0) <= 300
  and coalesce(length(msg91_auth_key), 0) <= 300
);

notify pgrst, 'reload schema';
