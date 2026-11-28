begin;

create or replace function public.add_calling_holder_with_buildings(
  unit_id uuid, calling_type_id uuid, contact_id uuid, new_contact_name text,
  new_contact_phone text, new_contact_email text, sustained_on date, released_on date,
  assignment_labels text[], building_ids uuid[]
) returns void
language plpgsql set search_path = '' as $$
declare
  calling_scope public.calling_level;
  calling_unit_kind public.unit_kind;
  calling_position_id uuid;
  holder_id uuid := contact_id;
  calling_home_ward_id uuid;
  new_assignment_id uuid;
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;
  if (contact_id is null) = (new_contact_name is null) then
    raise exception 'Select an existing person or enter a new name.';
  end if;

  select u.level, u.kind into calling_scope, calling_unit_kind
  from public.units u
  join public.calling_types c on c.level = u.level
  where u.id = add_calling_holder_with_buildings.unit_id and c.id = add_calling_holder_with_buildings.calling_type_id;
  if not found then
    raise exception 'This calling does not apply to the selected unit.';
  end if;

  if calling_unit_kind in ('ward', 'branch') and released_on is null then
    calling_home_ward_id := unit_id;
  end if;

  insert into public.positions (unit_id, calling_type_id, level)
  values (add_calling_holder_with_buildings.unit_id, add_calling_holder_with_buildings.calling_type_id, calling_scope)
  on conflict on constraint positions_unit_id_calling_type_id_key do nothing;

  select p.id into strict calling_position_id from public.positions p
  where p.unit_id = add_calling_holder_with_buildings.unit_id and p.calling_type_id = add_calling_holder_with_buildings.calling_type_id;

  if holder_id is null then
    insert into public.contacts (name, phone, email, home_ward_id)
    values (btrim(new_contact_name), nullif(btrim(new_contact_phone), ''),
      nullif(lower(btrim(new_contact_email)), ''), calling_home_ward_id)
    returning id into holder_id;
  end if;

  insert into public.assignments (position_id, contact_id, sustained_on, released_on, assignment_labels)
  values (calling_position_id, holder_id, add_calling_holder_with_buildings.sustained_on,
    add_calling_holder_with_buildings.released_on, add_calling_holder_with_buildings.assignment_labels)
  returning id into new_assignment_id;

  -- The new calling makes a shared regional contact editable within the calling unit's scope.
  if contact_id is not null and calling_home_ward_id is not null then
    update public.contacts set home_ward_id = calling_home_ward_id where id = holder_id;
    if not found then
      raise exception 'The person’s Home Ward could not be updated.';
    end if;
  end if;

  insert into public.assignment_buildings (assignment_id, building_id)
  select distinct new_assignment_id, building_id from unnest(building_ids) as buildings(building_id);
end;
$$;

-- The SQL Editor runs without an app user. Suspend the app's contact scope check
-- for this backfill only. The Home Ward foreign key still validates the links.
alter table public.contacts disable trigger check_contact_scope;

with calling_wards as (
  select a.contact_id, (array_agg(distinct u.id))[1] as home_ward_id
  from public.assignments a
  join public.positions p on p.id = a.position_id
  join public.units u on u.id = p.unit_id
  where a.released_on is null and p.retired_on is null and u.kind in ('ward', 'branch')
  group by a.contact_id
  having count(distinct u.id) = 1
)
update public.contacts c
set home_ward_id = w.home_ward_id
from calling_wards w
where c.id = w.contact_id and c.home_ward_id is distinct from w.home_ward_id;

alter table public.contacts enable trigger check_contact_scope;

commit;
