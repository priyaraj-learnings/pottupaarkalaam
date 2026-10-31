-- "Started a try-on" in the /admin funnel (Visitors → Started → Signed up →
-- Tried on → Recharged): a visitor who added a first photo, counted once a
-- day with the same daily visitor code as visits (20261030000200_site_visits),
-- no cookies. Visitors can now start before signing in.

alter table public.site_visit_days
  add column if not exists starts integer not null default 0 check (starts >= 0);

alter table public.site_visitors
  add column if not exists started boolean not null default false;

-- A visitor's first photo of the day (India date): counts them as a visitor
-- too if this is their first request today.
create or replace function public.record_try_on_start(p_visitor_code text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_new_visitor integer;
  v_new_start integer;
begin
  insert into public.site_visitors (day, visitor_code) values (v_day, p_visitor_code)
  on conflict do nothing;
  get diagnostics v_new_visitor = row_count;
  update public.site_visitors set started = true
  where day = v_day and visitor_code = p_visitor_code and not started;
  get diagnostics v_new_start = row_count;
  insert into public.site_visit_days (day, visitors, page_views, starts) values (v_day, v_new_visitor, 0, v_new_start)
  on conflict (day) do update set
    visitors = public.site_visit_days.visitors + excluded.visitors,
    starts = public.site_visit_days.starts + excluded.starts;
end $$;

revoke all on function public.record_try_on_start(text) from public, anon, authenticated;
grant execute on function public.record_try_on_start(text) to service_role;

notify pgrst, 'reload schema';
