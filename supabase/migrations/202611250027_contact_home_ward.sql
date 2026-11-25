begin;

alter table public.contacts
  add column home_ward_id uuid,
  -- PostgreSQL disallows ON DELETE SET NULL on a foreign key containing a generated column.
  add column home_ward_level public.calling_level not null default 'ward'
    constraint contacts_home_ward_level_check check (home_ward_level = 'ward'),
  add constraint contacts_home_ward_fk
    foreign key (home_ward_id, home_ward_level) references public.units (id, level)
    on delete set null (home_ward_id);

create index contacts_home_ward on public.contacts (home_ward_id) where home_ward_id is not null;

-- Keep person creation and the calling assignment in the same transaction.
create function public.add_calling_holder_with_buildings(
  unit_id uuid, calling_type_id uuid, contact_id uuid, new_contact_name text,
  new_contact_phone text, new_contact_email text, sustained_on date, released_on date,
  assignment_labels text[], building_ids uuid[], new_contact_home_ward_id uuid
) returns void
language plpgsql set search_path = '' as $$
declare
  holder_id uuid;
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;
  if contact_id is not null or new_contact_name is null then
    raise exception 'Enter a new person to set their Home Ward here.';
  end if;

  insert into public.contacts (name, phone, email, home_ward_id)
  values (btrim(new_contact_name), nullif(btrim(new_contact_phone), ''),
    nullif(lower(btrim(new_contact_email)), ''), new_contact_home_ward_id)
  returning id into holder_id;

  perform public.add_calling_holder_with_buildings(
    unit_id, calling_type_id, holder_id, null, null, null,
    sustained_on, released_on, assignment_labels, building_ids
  );
end;
$$;

revoke all on function public.add_calling_holder_with_buildings(uuid, uuid, uuid, text, text, text, date, date, text[], uuid[], uuid)
  from public, anon;
grant execute on function public.add_calling_holder_with_buildings(uuid, uuid, uuid, text, text, text, date, date, text[], uuid[], uuid)
  to authenticated;

commit;
