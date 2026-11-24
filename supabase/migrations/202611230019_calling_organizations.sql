begin;

do $$
begin
  if to_regclass('public.assignment_buildings') is null then
    raise exception 'Apply 202611230018_building_scheduler_assignments.sql before running this migration.';
  end if;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 150),
  level public.calling_level not null,
  sort_order integer check (sort_order > 0)
);
alter table public.organizations add column if not exists sort_order integer check (sort_order > 0);
create unique index if not exists organizations_id_level_key on public.organizations (id, level);
create unique index if not exists organizations_unique_name on public.organizations (level, lower(btrim(name)));

alter table public.organizations enable row level security;
revoke all on public.organizations from anon, authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
drop policy if exists directory_members on public.organizations;
create policy directory_members on public.organizations for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);

alter table public.calling_types
  add column if not exists organization_id uuid,
  add column if not exists default_multiple_holders boolean not null default false;

-- Preserve calling IDs and flatten each existing tree into the root's organization.
with recursive existing_callings as (
  select c.*, (to_jsonb(c)->>'parent_calling_type_id')::uuid as previous_parent_id
  from public.calling_types c
), roots as (
  select c.id, c.level, c.sort_order, c.organization_id,
    case
      when c.level = 'ward' and btrim(c.name) ~* '^bishop(ric)?([[:space:]’'']|$)' then 'Bishopric'
      when c.level = 'ward' and btrim(c.name) ~* '^branch presiden(t|cy)([[:space:]’'']|$)' then 'Branch Presidency'
      when c.level = 'stake' and btrim(c.name) ~* '^stake presiden(t|cy)([[:space:]’'']|$)' then 'Stake Presidency'
      when btrim(c.name) ~* '^((stake|ward|branch)[[:space:]]+)?relief society([[:space:]’'']|$)' then 'Relief Society'
      when exists (
        select 1 from existing_callings child where child.previous_parent_id = c.id
      ) then regexp_replace(btrim(c.name), '[[:space:]]+president$', '', 'i')
    end as organization_name
  from existing_callings c
  where c.previous_parent_id is null
), calling_groups as (
  select id, level, organization_id, coalesce(organization_name, 'Other Callings') as organization_name,
    case when organization_name is not null then sort_order end as organization_order
  from roots
  union all
  select child.id, child.level, coalesce(child.organization_id, parent.organization_id),
    parent.organization_name, parent.organization_order
  from existing_callings child
  join calling_groups parent on parent.id = child.previous_parent_id
), backfill as (
  select g.* from calling_groups g
  join existing_callings c on c.id = g.id
  where c.organization_id is null
), created_organizations as (
  insert into public.organizations (name, level, sort_order)
  select min(organization_name), level, min(organization_order)
  from backfill
  where organization_id is null
  group by level, lower(organization_name)
  on conflict (level, lower(btrim(name))) do nothing
  returning id, level, name
), available_organizations as (
  -- The UPDATE can see rows inserted by this statement only through RETURNING.
  select id, level, name from public.organizations
  union all
  select id, level, name from created_organizations
)
update public.calling_types c
set organization_id = coalesce(b.organization_id, o.id)
from backfill b
left join available_organizations o on o.level = b.level and lower(btrim(o.name)) = lower(b.organization_name)
where c.id = b.id and c.organization_id is null;

drop trigger if exists validate_calling_parent on public.calling_types;
drop function if exists public.check_calling_parent();
drop index if exists public.calling_types_unique_name;
alter table public.calling_types
  drop column if exists parent_calling_type_id,
  alter column organization_id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.calling_types'::regclass and conname = 'calling_organization_fk'
  ) then
    alter table public.calling_types add constraint calling_organization_fk
      foreign key (organization_id, level) references public.organizations (id, level);
  end if;
end;
$$;
create index if not exists calling_types_organization on public.calling_types (organization_id);

-- Unit-specific holder limits stay intact. A new position inherits its calling's default
-- when the caller does not supply a unit-specific limit.
alter table public.positions alter column multiple_holders drop default;
create or replace function public.default_position_holder_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.multiple_holders is null then
    select c.default_multiple_holders into new.multiple_holders
    from public.calling_types c where c.id = new.calling_type_id;
  end if;
  return new;
end;
$$;
create or replace trigger default_position_holder_limit before insert on public.positions
  for each row execute function public.default_position_holder_limit();
revoke all on function public.default_position_holder_limit() from public, anon, authenticated;

drop function if exists public.save_calling_order(public.calling_level, uuid[]);
create or replace function public.save_calling_order(organization uuid, ordered_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;
  lock table public.calling_types in share row exclusive mode;
  if coalesce(cardinality(ordered_ids), 0) = 0
    or cardinality(ordered_ids) <> (select count(*) from public.calling_types where organization_id = organization)
    or cardinality(ordered_ids) <> (
      select count(distinct c.id)
      from unnest(ordered_ids) as requested(id)
      join public.calling_types c on c.id = requested.id and c.organization_id = organization
    ) then
    raise exception 'This organization changed. Close the reorder list, refresh, and try again.';
  end if;

  update public.calling_types c
  set sort_order = requested.rank::integer
  from unnest(ordered_ids) with ordinality as requested(id, rank)
  where c.id = requested.id and c.organization_id = organization;
end;
$$;
revoke all on function public.save_calling_order(uuid, uuid[]) from public, anon;
grant execute on function public.save_calling_order(uuid, uuid[]) to authenticated;

drop trigger if exists validate_fh_assignment on public.assignments;
drop function if exists public.check_fh_assignment();
alter table public.assignments add column if not exists assignment_labels text[] not null default '{}';
update public.assignments set assignment_labels = '{}' where assignment_labels is null;
alter table public.assignments alter column assignment_labels set default '{}', alter column assignment_labels set not null;
do $$
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.assignments'::regclass and attname = 'fh_assignment' and not attisdropped
  ) then
    update public.assignments
    set assignment_labels = array_append(assignment_labels, 'FH Assignment')
    where fh_assignment and not ('FH Assignment' = any(assignment_labels));
    alter table public.assignments drop column fh_assignment;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assignments'::regclass and conname = 'assignment_labels_no_nulls'
  ) then
    alter table public.assignments add constraint assignment_labels_no_nulls
      check (array_position(assignment_labels, null) is null);
  end if;
end;
$$;

drop function if exists public.add_calling_holder_with_contact(uuid, uuid, text, text, text, date, date, boolean);
drop function if exists public.add_calling_holder(uuid, uuid, uuid, text, date, date, boolean);
drop function if exists public.add_calling_holder_with_buildings(uuid, uuid, uuid, text, text, text, date, date, boolean, uuid[]);
drop function if exists public.update_calling_holder_buildings(uuid, date, date, boolean, uuid[]);

create or replace function public.add_calling_holder_with_buildings(
  unit_id uuid, calling_type_id uuid, contact_id uuid, new_contact_name text,
  new_contact_phone text, new_contact_email text, sustained_on date, released_on date,
  assignment_labels text[], building_ids uuid[]
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

  insert into public.assignments (position_id, contact_id, sustained_on, released_on, assignment_labels)
  values (calling_position_id, holder_id, add_calling_holder_with_buildings.sustained_on,
    add_calling_holder_with_buildings.released_on, add_calling_holder_with_buildings.assignment_labels)
  returning id into new_assignment_id;

  insert into public.assignment_buildings (assignment_id, building_id)
  select distinct new_assignment_id, building_id from unnest(building_ids) as buildings(building_id);
end;
$$;

create or replace function public.update_calling_holder_buildings(
  assignment_id uuid, sustained_on date, released_on date, assignment_labels text[], building_ids uuid[]
) returns void
language plpgsql set search_path = '' as $$
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;

  update public.assignments a
  set sustained_on = update_calling_holder_buildings.sustained_on,
      released_on = update_calling_holder_buildings.released_on,
      assignment_labels = update_calling_holder_buildings.assignment_labels
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

revoke all on function public.add_calling_holder_with_buildings(uuid, uuid, uuid, text, text, text, date, date, text[], uuid[]),
  public.update_calling_holder_buildings(uuid, date, date, text[], uuid[]) from public, anon;
grant execute on function public.add_calling_holder_with_buildings(uuid, uuid, uuid, text, text, text, date, date, text[], uuid[]),
  public.update_calling_holder_buildings(uuid, date, date, text[], uuid[]) to authenticated;

commit;
