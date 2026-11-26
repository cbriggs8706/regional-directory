alter table public.visit_events
  add column notes text check (notes is null or length(notes) <= 4000);

grant insert (notes), update (notes) on public.visit_events to authenticated;

create function public.schedule_unit_visit(visit_unit uuid, visit_date date, visit_notes text) returns integer
language plpgsql set search_path = '' as $$
declare added integer;
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;

  insert into public.visit_events (unit_id, event_date, kind, start_minute, end_minute, notes)
  select u.id, visit_date, meeting.kind, meeting.starts_at, meeting.starts_at + 60, nullif(btrim(visit_notes), '')
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

revoke all on function public.schedule_unit_visit(uuid, date, text) from public, anon;
grant execute on function public.schedule_unit_visit(uuid, date, text) to authenticated;

create or replace function public.schedule_unit_visit(visit_unit uuid, visit_date date) returns integer
language sql set search_path = '' as $$
  select public.schedule_unit_visit(visit_unit, visit_date, null::text);
$$;
