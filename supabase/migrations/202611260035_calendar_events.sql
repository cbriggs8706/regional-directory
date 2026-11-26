create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 150),
  event_date date not null check (event_date between date '0001-01-01' and date '9999-12-31'),
  end_date date check (end_date between event_date and date '9999-12-31')
);

create index calendar_events_date on public.calendar_events (event_date);

alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated;

create policy directory_members on public.calendar_events for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);

grant select, insert on public.calendar_events to authenticated;
