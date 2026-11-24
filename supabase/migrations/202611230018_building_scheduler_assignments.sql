create table public.assignment_buildings (
  assignment_id uuid not null references public.assignments on delete cascade,
  building_id uuid not null references public.buildings,
  primary key (assignment_id, building_id)
);
create index assignment_buildings_building on public.assignment_buildings (building_id);

alter table public.assignment_buildings enable row level security;
revoke all on public.assignment_buildings from anon, authenticated;
grant select, insert, delete on public.assignment_buildings to authenticated;
create policy directory_reads_assignment_buildings on public.assignment_buildings for select to authenticated
  using ((select public.directory_role()) is not null);
create policy directory_removes_assignment_buildings on public.assignment_buildings for delete to authenticated
  using ((select public.directory_role()) is not null);
create policy directory_adds_scheduler_buildings on public.assignment_buildings for insert to authenticated
  with check ((select public.directory_role()) is not null and exists (
    select 1
    from public.assignments a
    join public.positions p on p.id = a.position_id
    join public.calling_types c on c.id = p.calling_type_id
    where a.id = assignment_buildings.assignment_id and p.level = 'stake'
      and (lower(btrim(c.name)) = 'building scheduler' or exists (
        select 1 from public.calling_names n
        where n.calling_type_id = c.id and lower(btrim(n.previous_name)) = 'building scheduler'
      ))
  ));

create function public.add_calling_holder_with_buildings(
  unit_id uuid, calling_type_id uuid, contact_id uuid, new_contact_name text,
  new_contact_phone text, new_contact_email text, sustained_on date, released_on date,
  fh_assignment boolean, building_ids uuid[]
) returns void
language plpgsql set search_path = '' as $$
declare
  calling_scope public.calling_level;
  calling_position_id uuid;
  holder_id uuid := contact_id;
  new_assignment_id uuid;
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;
  if (contact_id is null) = (new_contact_name is null) then
    raise exception 'Select an existing person or enter a new name.';
  end if;

  select u.level into calling_scope
  from public.units u
  join public.calling_types c on c.level = u.level
  where u.id = add_calling_holder_with_buildings.unit_id and c.id = add_calling_holder_with_buildings.calling_type_id;
  if not found then
    raise exception 'This calling does not apply to the selected unit.';
  end if;

  insert into public.positions (unit_id, calling_type_id, level)
  values (add_calling_holder_with_buildings.unit_id, add_calling_holder_with_buildings.calling_type_id, calling_scope)
  on conflict on constraint positions_unit_id_calling_type_id_key do nothing;

  select p.id into strict calling_position_id from public.positions p
  where p.unit_id = add_calling_holder_with_buildings.unit_id and p.calling_type_id = add_calling_holder_with_buildings.calling_type_id;

  if holder_id is null then
    insert into public.contacts (name, phone, email)
    values (btrim(new_contact_name), nullif(btrim(new_contact_phone), ''), nullif(lower(btrim(new_contact_email)), ''))
    returning id into holder_id;
  end if;

  insert into public.assignments (position_id, contact_id, sustained_on, released_on, fh_assignment)
  values (calling_position_id, holder_id, add_calling_holder_with_buildings.sustained_on,
    add_calling_holder_with_buildings.released_on, add_calling_holder_with_buildings.fh_assignment)
  returning id into new_assignment_id;

  insert into public.assignment_buildings (assignment_id, building_id)
  select distinct new_assignment_id, building_id from unnest(building_ids) as buildings(building_id);
end;
$$;

create or replace function public.add_calling_holder(
  unit_id uuid, calling_type_id uuid, contact_id uuid, new_contact_name text,
  sustained_on date, released_on date, fh_assignment boolean
) returns void
language sql set search_path = '' as $$
  select public.add_calling_holder_with_buildings(
    unit_id, calling_type_id, contact_id, new_contact_name, null, null, sustained_on, released_on, fh_assignment, '{}'
  );
$$;

create or replace function public.add_calling_holder_with_contact(
  unit_id uuid, calling_type_id uuid, new_contact_name text, new_contact_phone text,
  new_contact_email text, sustained_on date, released_on date, fh_assignment boolean
) returns void
language sql set search_path = '' as $$
  select public.add_calling_holder_with_buildings(
    unit_id, calling_type_id, null, new_contact_name, new_contact_phone, new_contact_email,
    sustained_on, released_on, fh_assignment, '{}'
  );
$$;

create function public.update_calling_holder_buildings(
  assignment_id uuid, sustained_on date, released_on date, fh_assignment boolean, building_ids uuid[]
) returns void
language plpgsql set search_path = '' as $$
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;

  update public.assignments a
  set sustained_on = update_calling_holder_buildings.sustained_on,
      released_on = update_calling_holder_buildings.released_on,
      fh_assignment = coalesce(update_calling_holder_buildings.fh_assignment, a.fh_assignment)
  where a.id = update_calling_holder_buildings.assignment_id;
  if not found then
    raise exception 'This assignment is no longer available.';
  end if;

  delete from public.assignment_buildings b where b.assignment_id = update_calling_holder_buildings.assignment_id;
  insert into public.assignment_buildings (assignment_id, building_id)
  select distinct update_calling_holder_buildings.assignment_id, building_id
  from unnest(building_ids) as buildings(building_id);
end;
$$;

revoke all on function public.add_calling_holder_with_buildings(uuid, uuid, uuid, text, text, text, date, date, boolean, uuid[]),
  public.update_calling_holder_buildings(uuid, date, date, boolean, uuid[]) from public, anon;
grant execute on function public.add_calling_holder_with_buildings(uuid, uuid, uuid, text, text, text, date, date, boolean, uuid[]),
  public.update_calling_holder_buildings(uuid, date, date, boolean, uuid[]) to authenticated;
