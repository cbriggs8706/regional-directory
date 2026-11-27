create table public.private_calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 150),
  event_date date not null check (event_date between date '0001-01-01' and date '9999-12-31'),
  end_date date check (end_date between event_date and date '9999-12-31')
);

create index private_calendar_events_owner_date on public.private_calendar_events (owner_id, event_date);

alter table public.private_calendar_events enable row level security;
revoke all on public.private_calendar_events from public, anon, authenticated;
grant select, delete on public.private_calendar_events to authenticated;
grant insert (title, event_date, end_date), update (title, event_date, end_date)
  on public.private_calendar_events to authenticated;

create policy owners_manage_private_calendar_events on public.private_calendar_events for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.directory_role()) is not null)
  with check (owner_id = (select auth.uid()) and (select public.directory_role()) is not null);
