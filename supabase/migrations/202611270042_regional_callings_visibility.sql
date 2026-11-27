begin;

-- Region-level calling records are shared for reading. Council scope still
-- determines which positions and assignments members can change.
drop policy if exists council_scope on public.positions;
drop policy if exists regional_position_reads on public.positions;
create policy regional_position_reads on public.positions as restrictive for select to authenticated
  using ((select public.directory_role()) = 'admin'
    or (level = 'region' and (select public.directory_role()) = 'member')
    or unit_id in (select directory_scope.unit_ids()));

do $$
declare target record;
begin
  for target in select * from (values
    ('positions', 'unit_id in (select directory_scope.unit_ids())'),
    ('assignments', 'position_id in (select id from public.positions where unit_id in (select directory_scope.unit_ids()))'),
    ('calling_types', 'level <> ''region'''),
    ('organizations', 'level <> ''region''')
  ) as scopes(table_name, predicate)
  loop
    execute format('drop policy if exists scoped_calling_insert on public.%I', target.table_name);
    execute format('drop policy if exists scoped_calling_update on public.%I', target.table_name);
    execute format('drop policy if exists scoped_calling_delete on public.%I', target.table_name);
    execute format('create policy scoped_calling_insert on public.%I as restrictive for insert to authenticated
      with check ((select public.directory_role()) = ''admin'' or %s)', target.table_name, target.predicate);
    execute format('create policy scoped_calling_update on public.%I as restrictive for update to authenticated
      using ((select public.directory_role()) = ''admin'' or %s)
      with check ((select public.directory_role()) = ''admin'' or %s)', target.table_name, target.predicate, target.predicate);
    execute format('create policy scoped_calling_delete on public.%I as restrictive for delete to authenticated
      using ((select public.directory_role()) = ''admin'' or %s)', target.table_name, target.predicate);
  end loop;
end;
$$;

create or replace function directory_scope.regional_contact_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.contact_id
  from public.assignments a join public.positions p on p.id = a.position_id
  where p.level = 'region' and (select public.directory_role()) = 'member'
$$;
revoke all on function directory_scope.regional_contact_ids() from public, anon;
grant execute on function directory_scope.regional_contact_ids() to authenticated;

drop policy if exists council_contact_reads on public.contacts;
create policy council_contact_reads on public.contacts as restrictive for select to authenticated
  using ((select public.directory_role()) = 'admin'
    or directory_scope.contact_visible(id, ward_id, home_ward_id, created_by_email)
    or (not is_focus_person and id in (select directory_scope.regional_contact_ids())));

-- A released regional holder can later become a focus person. Keep their
-- records within their focus ward's scope.
drop policy if exists regional_assignment_contact_reads on public.assignments;
create policy regional_assignment_contact_reads on public.assignments as restrictive for select to authenticated
  using (position_id in (select id from public.positions where level <> 'region')
    or contact_id in (select id from public.contacts));

drop policy if exists council_focus_activity_reads on public.focus_person_activity;
create policy council_focus_activity_reads on public.focus_person_activity as restrictive for select to authenticated
  using ((select public.directory_role()) = 'admin' or contact_id in (
    select id from public.contacts
    where directory_scope.contact_visible(id, ward_id, home_ward_id, created_by_email)
  ));

commit;
