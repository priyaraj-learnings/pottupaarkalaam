-- Website visits, counted without cookies or a third party. The server makes
-- a one-way code from the visitor's address and browser with a key that
-- changes every day (lib/server/visits.ts), so the same visitor counts once a
-- day and cannot be followed from one day to the next. Codes are kept only for
-- the day they were made (purge_site_visitors, from the hourly clean-up);
-- what stays is the count per day.

create table if not exists public.site_visit_days (
  day date primary key,
  visitors integer not null default 0 check (visitors >= 0),
  page_views integer not null default 0 check (page_views >= 0)
);

create table if not exists public.site_visitors (
  day date not null,
  visitor_code text not null check (visitor_code ~ '^[0-9a-f]{64}$'),
  primary key (day, visitor_code)
);

alter table public.site_visit_days enable row level security;
alter table public.site_visitors enable row level security;
revoke all on table public.site_visit_days, public.site_visitors from public, anon, authenticated;
grant select, insert, update, delete on table public.site_visit_days, public.site_visitors to service_role;

-- One page view (India date); a new visitor code for the day adds a visitor.
create or replace function public.record_site_visit(p_visitor_code text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_new integer;
begin
  insert into public.site_visitors (day, visitor_code) values (v_day, p_visitor_code)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  insert into public.site_visit_days (day, visitors, page_views) values (v_day, v_new, 1)
  on conflict (day) do update set
    visitors = public.site_visit_days.visitors + excluded.visitors,
    page_views = public.site_visit_days.page_views + 1;
end $$;

-- Hourly clean-up: visitor codes of earlier days are no longer needed.
create or replace function public.purge_site_visitors()
returns integer
language sql security definer set search_path = public, pg_temp as $$
  with gone as (
    delete from public.site_visitors
    where day < (now() at time zone 'Asia/Kolkata')::date
    returning 1
  )
  select count(*)::integer from gone
$$;

revoke all on function public.record_site_visit(text) from public, anon, authenticated;
revoke all on function public.purge_site_visitors() from public, anon, authenticated;
grant execute on function public.record_site_visit(text) to service_role;
grant execute on function public.purge_site_visitors() to service_role;

notify pgrst, 'reload schema';
