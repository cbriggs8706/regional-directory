create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  address text not null check (length(btrim(address)) between 1 and 300),
  travel_minutes_from_malta integer check (travel_minutes_from_malta >= 0)
);
create unique index buildings_unique_address on public.buildings (lower(btrim(address)));
alter table public.buildings enable row level security;
revoke all on public.buildings from anon, authenticated;
grant select, insert, update, delete on public.buildings to authenticated;
create policy directory_members on public.buildings for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);

alter table public.units add column building_id uuid references public.buildings (id);
create index units_building on public.units (building_id) where building_id is not null;

create type public.visit_kind as enum ('sacrament', 'council', 'visit');

create table public.visit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_email text not null default (auth.jwt() ->> 'email'),
  unit_id uuid not null references public.units (id),
  event_date date not null,
  kind public.visit_kind not null,
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute > start_minute and end_minute <= start_minute + 1440),
  unique (owner_id, unit_id, event_date, kind)
);
create index visit_events_by_date on public.visit_events (event_date, id);

alter table public.visit_events enable row level security;
revoke all on public.visit_events from anon, authenticated;
grant select, delete on public.visit_events to authenticated;
grant insert (unit_id, event_date, kind, start_minute, end_minute),
  update (event_date, start_minute, end_minute) on public.visit_events to authenticated;
create policy directory_reads_visits on public.visit_events for select to authenticated
  using ((select public.directory_role()) is not null);
create policy owner_creates_visits on public.visit_events for insert to authenticated
  with check ((select public.directory_role()) is not null and owner_id = (select auth.uid()));
create policy owner_updates_visits on public.visit_events for update to authenticated
  using ((select public.directory_role()) is not null and owner_id = (select auth.uid()))
  with check ((select public.directory_role()) is not null and owner_id = (select auth.uid()));
create policy owner_deletes_visits on public.visit_events for delete to authenticated
  using ((select public.directory_role()) is not null and owner_id = (select auth.uid()));

create function public.schedule_unit_visit(visit_unit uuid, visit_date date) returns integer
language plpgsql set search_path = '' as $$
declare added integer;
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;

  insert into public.visit_events (unit_id, event_date, kind, start_minute, end_minute)
  select u.id, visit_date, meeting.kind, meeting.starts_at, meeting.starts_at + 60
  from public.units u
  cross join lateral (values
    ('sacrament'::public.visit_kind, extract(hour from u.sacrament_meeting_time)::integer * 60 + extract(minute from u.sacrament_meeting_time)::integer),
    ('council'::public.visit_kind, extract(hour from u.council_meeting_time)::integer * 60 + extract(minute from u.council_meeting_time)::integer)
  ) as meeting(kind, starts_at)
  where u.id = visit_unit and meeting.starts_at is not null
  on conflict (owner_id, unit_id, event_date, kind) do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;
revoke all on function public.schedule_unit_visit(uuid, date) from public, anon;
grant execute on function public.schedule_unit_visit(uuid, date) to authenticated;
