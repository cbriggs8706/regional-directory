alter table public.assignments add column fh_assignment boolean not null default false;

-- Transfer the old mark only when it identifies exactly one current holder.
update public.assignments a
set fh_assignment = true
from public.positions p
where p.id = a.position_id and p.fh_assignment and a.released_on is null
  and not exists (
    select 1 from public.assignments other
    where other.position_id = a.position_id and other.released_on is null and other.id <> a.id
  );

create function public.check_fh_assignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.fh_assignment and not exists (
    select 1 from public.positions where id = new.position_id and level in ('stake', 'ward')
  ) then
    raise exception 'FH Assignment is available for stake, ward, and branch holders.';
  end if;
  return new;
end;
$$;
create trigger validate_fh_assignment before insert or update on public.assignments
  for each row execute function public.check_fh_assignment();
revoke all on function public.check_fh_assignment() from public, anon, authenticated;

create function public.add_calling_holder(
  unit_id uuid, calling_type_id uuid, contact_id uuid, new_contact_name text,
  sustained_on date, released_on date, fh_assignment boolean
) returns void
language plpgsql set search_path = '' as $$
declare
  calling_scope public.calling_level;
  calling_position_id uuid;
  holder_id uuid := contact_id;
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
  where u.id = add_calling_holder.unit_id and c.id = add_calling_holder.calling_type_id;
  if not found then
    raise exception 'This calling does not apply to the selected unit.';
  end if;

  insert into public.positions (unit_id, calling_type_id, level)
  values (add_calling_holder.unit_id, add_calling_holder.calling_type_id, calling_scope)
  on conflict on constraint positions_unit_id_calling_type_id_key do nothing;

  select p.id into strict calling_position_id from public.positions p
  where p.unit_id = add_calling_holder.unit_id and p.calling_type_id = add_calling_holder.calling_type_id;

  if holder_id is null then
    insert into public.contacts (name) values (btrim(new_contact_name)) returning id into holder_id;
  end if;

  insert into public.assignments (position_id, contact_id, sustained_on, released_on, fh_assignment)
  values (calling_position_id, holder_id, add_calling_holder.sustained_on,
    add_calling_holder.released_on, add_calling_holder.fh_assignment);
end;
$$;
revoke all on function public.add_calling_holder(uuid, uuid, uuid, text, date, date, boolean) from public, anon;
grant execute on function public.add_calling_holder(uuid, uuid, uuid, text, date, date, boolean) to authenticated;
