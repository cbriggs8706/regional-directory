create function public.add_calling_holder_with_contact(
  unit_id uuid, calling_type_id uuid, new_contact_name text, new_contact_phone text,
  new_contact_email text, sustained_on date, released_on date, fh_assignment boolean
) returns void
language plpgsql set search_path = '' as $$
declare
  holder_id uuid;
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;

  insert into public.contacts (name, phone, email)
  values (btrim(new_contact_name), nullif(btrim(new_contact_phone), ''), nullif(lower(btrim(new_contact_email)), ''))
  returning id into holder_id;

  perform public.add_calling_holder(unit_id, calling_type_id, holder_id, null, sustained_on, released_on, fh_assignment);
end;
$$;

revoke all on function public.add_calling_holder_with_contact(uuid, uuid, text, text, text, date, date, boolean)
  from public, anon;
grant execute on function public.add_calling_holder_with_contact(uuid, uuid, text, text, text, date, date, boolean)
  to authenticated;
