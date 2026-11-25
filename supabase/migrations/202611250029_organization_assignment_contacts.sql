create function public.add_organization_assignment_with_contact(
  organization_id uuid, title_id uuid, active boolean, contact_name text,
  contact_phone text, contact_email text, contact_home_ward_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  new_contact_id uuid;
  assignment_id uuid;
begin
  if public.directory_role() is null then
    raise insufficient_privilege using message = 'You need approved directory access.';
  end if;

  perform 1 from public.organization_titles as title
  where title.id = add_organization_assignment_with_contact.title_id
    and title.organization_id = add_organization_assignment_with_contact.organization_id
  for share;
  if not found then
    raise foreign_key_violation using message = 'This assignment title is unavailable.';
  end if;

  insert into public.contacts (name, phone, email, home_ward_id)
  values (btrim(contact_name), nullif(btrim(contact_phone), ''),
    nullif(lower(btrim(contact_email)), ''), contact_home_ward_id)
  returning id into new_contact_id;

  insert into public.organization_assignments (title_id, contact_id, active)
  values (add_organization_assignment_with_contact.title_id, new_contact_id, add_organization_assignment_with_contact.active)
  returning id into assignment_id;

  return assignment_id;
end;
$$;

revoke all on function public.add_organization_assignment_with_contact(uuid, uuid, boolean, text, text, text, uuid)
  from public, anon;
grant execute on function public.add_organization_assignment_with_contact(uuid, uuid, boolean, text, text, text, uuid)
  to authenticated;
