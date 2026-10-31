-- Telegram alerts to the admin when a recharge needs checking (/admin
-- Settings). The bot token is secret: only the server reads it (app_settings
-- stays service_role only). The chat is whoever sent the bot a message last
-- when the admin pressed Connect: a person or a group. admin_url is the /admin
-- address the alert links to, taken from the admin's browser.

alter table public.app_settings
  add column if not exists telegram_bot_token text,
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_chat_name text,
  add column if not exists telegram_admin_url text;

alter table public.app_settings drop constraint if exists app_settings_telegram_check;
alter table public.app_settings add constraint app_settings_telegram_check check (
  coalesce(length(telegram_bot_token), 0) <= 100
  and (telegram_chat_id is null or telegram_chat_id ~ '^-?[0-9]{1,20}$')
  and coalesce(length(telegram_chat_name), 0) <= 200
  and coalesce(length(telegram_admin_url), 0) <= 300
);

notify pgrst, 'reload schema';
