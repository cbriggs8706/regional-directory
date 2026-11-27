begin;

create schema if not exists directory_scope;
revoke all on schema directory_scope from public;
grant usage on schema directory_scope to authenticated;

do $$
begin
  if to_regclass('public.directory_access_councils') is null then
    create table public.directory_access_councils (
      email text not null references public.directory_access on delete cascade,
      council_id uuid not null,
      council_kind public.unit_kind not null default 'council' check (council_kind = 'council'),
      primary key (email, council_id),
      foreign key (council_id, council_kind) references public.units (id, kind) on delete cascade
    );

    -- Seed existing members once. Reruns preserve all saved council assignments.
    insert into public.directory_access_councils (email, council_id)
    select member.email, unit.id
    from public.directory_access member cross join public.units unit
    where not member.is_admin and unit.kind = 'council';
  end if;
end;
$$;

create index if not exists directory_access_councils_unit on public.directory_access_councils (council_id);
alter table public.directory_access_councils enable row level security;
revoke all on public.directory_access_councils from anon, authenticated;
grant select on public.directory_access_councils to authenticated;
drop policy if exists admin_reads_council_access on public.directory_access_councils;
create policy admin_reads_council_access on public.directory_access_councils for select to authenticated
  using ((select public.directory_role()) = 'admin');

create or replace function directory_scope.preview_email() returns text
language sql stable security definer set search_path = '' as $$
  select nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-directory-preview'
  from public.directory_access
  where is_admin and auth.uid() is not null
    and auth.jwt() -> 'app_metadata' ->> 'provider' = 'google'
    and email = lower(auth.jwt() ->> 'email')
$$;

create or replace function directory_scope.viewer_email() returns text
language sql stable set search_path = '' as $$
  select coalesce(directory_scope.preview_email(), lower(auth.jwt() ->> 'email'))
$$;

create or replace function public.directory_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when is_admin then 'admin' else 'member' end
  from public.directory_access
  where auth.uid() is not null
    and auth.jwt() -> 'app_metadata' ->> 'provider' = 'google'
    and email = directory_scope.viewer_email()
    and (not is_admin or directory_scope.preview_email() is null)
$$;

-- The app uses this endpoint so it can only load with scoped policies installed.
create or replace function public.directory_access_role() returns text
language sql stable set search_path = '' as $$
  select public.directory_role()
$$;
revoke all on function public.directory_access_role() from public, anon;
grant execute on function public.directory_access_role() to authenticated;

drop policy if exists admin_grants_access on public.directory_access;
revoke insert on public.directory_access from authenticated;

create or replace function public.save_council_access(account_email text, council_ids uuid[], grant_access boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.directory_role() is distinct from 'admin' then
    raise insufficient_privilege using message = 'Only the administrator can manage council access.';
  end if;

  if grant_access then
    insert into public.directory_access (email) values (account_email);
  else
    perform 1 from public.directory_access where email = account_email and not is_admin for update;
    if not found then
      raise exception 'This member account is no longer available.';
    end if;
  end if;

  delete from public.directory_access_councils where email = account_email;
  insert into public.directory_access_councils (email, council_id)
  select account_email, id from (select distinct unnest(council_ids) as id) councils;
end;
$$;
revoke all on function public.save_council_access(text, uuid[], boolean) from public, anon;
grant execute on function public.save_council_access(text, uuid[], boolean) to authenticated;

create or replace function directory_scope.unit_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  with recursive allowed(id) as (
    select council_id from public.directory_access_councils
    where email = (select directory_scope.viewer_email()) and (select public.directory_role()) = 'member'
    union all
    select unit.id from public.units unit join allowed on unit.parent_id = allowed.id
  )
  select id from allowed
$$;

create or replace function directory_scope.can_edit_council(council uuid, parent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.units
    where id = council and kind = 'council' and parent_id = parent
      and id in (select directory_scope.unit_ids())
  )
$$;

-- Unlinked records are visible to their creator until they are assigned to a unit.
alter table public.contacts add column if not exists created_by_email text;
alter table public.contacts alter column created_by_email set default directory_scope.viewer_email();
alter table public.buildings add column if not exists created_by_email text;
alter table public.buildings alter column created_by_email set default directory_scope.viewer_email();
create index if not exists contacts_home_ward_scope on public.contacts (home_ward_id) where home_ward_id is not null;
create index if not exists directory_organizations_building_scope on public.directory_organizations (building_id) where building_id is not null;

create or replace function directory_scope.contact_visible(person uuid, focus_ward uuid, home_ward uuid, creator text)
returns boolean language sql stable security definer set search_path = '' as $$
  with allowed as materialized (select directory_scope.unit_ids() as id),
  linked as (
    select p.unit_id from public.assignments a
    join public.positions p on p.id = a.position_id where a.contact_id = person
    union
    select o.agent_id from public.organization_assignments a
    join public.organization_titles t on t.id = a.title_id
    join public.directory_organizations o on o.id = t.organization_id where a.contact_id = person
  )
  select case when focus_ward is not null then focus_ward in (select id from allowed)
    else home_ward in (select id from allowed)
      or exists (select 1 from linked join allowed on allowed.id = linked.unit_id)
      or (creator = directory_scope.viewer_email() and home_ward is null and not exists (select 1 from linked))
    end
$$;

create or replace function directory_scope.building_visible(building uuid, agent uuid, creator text)
returns boolean language sql stable security definer set search_path = '' as $$
  with allowed as materialized (select directory_scope.unit_ids() as id),
  linked as (
    select id as unit_id from public.units where building_id = building
    union
    select agent_id from public.directory_organizations where building_id = building
    union
    select p.unit_id from public.assignment_buildings b
    join public.assignments a on a.id = b.assignment_id
    join public.positions p on p.id = a.position_id where b.building_id = building
  )
  select agent in (select id from allowed)
    or exists (select 1 from linked join allowed on allowed.id = linked.unit_id)
    or (creator = directory_scope.viewer_email() and agent is null and not exists (select 1 from linked))
$$;

-- Validate new links while allowing edits that leave a shared record's existing links alone.
create or replace function directory_scope.check_shared_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select public.directory_role()) = 'admin' then return new; end if;
  if tg_op = 'UPDATE' and new.created_by_email is distinct from old.created_by_email then
    raise insufficient_privilege;
  end if;
  if tg_table_name = 'contacts' then
    if new.home_ward_id is not null
      and (tg_op = 'INSERT' or new.home_ward_id is distinct from old.home_ward_id)
      and new.home_ward_id not in (select directory_scope.unit_ids()) then
      raise insufficient_privilege;
    end if;
  elsif new.agent_stake_id is not null
    and (tg_op = 'INSERT' or new.agent_stake_id is distinct from old.agent_stake_id)
    and new.agent_stake_id not in (select directory_scope.unit_ids()) then
    raise insufficient_privilege;
  end if;
  return new;
end;
$$;
drop trigger if exists check_contact_scope on public.contacts;
create trigger check_contact_scope before insert or update on public.contacts
  for each row execute function directory_scope.check_shared_links();
drop trigger if exists check_building_scope on public.buildings;
create trigger check_building_scope before insert or update on public.buildings
  for each row execute function directory_scope.check_shared_links();

-- Restrictive policies intersect with existing owner, write, and validation policies.
drop policy if exists council_unit_reads on public.units;
create policy council_unit_reads on public.units as restrictive for select to authenticated
  using ((select public.directory_role()) = 'admin' or id in (select directory_scope.unit_ids())
    or (kind in ('stake', 'ward', 'branch') and parent_id in (select directory_scope.unit_ids())));
drop policy if exists council_unit_inserts on public.units;
create policy council_unit_inserts on public.units as restrictive for insert to authenticated
  with check ((select public.directory_role()) = 'admin' or (kind in ('stake', 'ward', 'branch')
    and parent_id in (select directory_scope.unit_ids())
    and (building_id is null or exists (select 1 from public.buildings b where b.id = building_id))));
drop policy if exists council_unit_updates on public.units;
create policy council_unit_updates on public.units as restrictive for update to authenticated
  using ((select public.directory_role()) = 'admin' or id in (select directory_scope.unit_ids()))
  with check ((select public.directory_role()) = 'admin' or (
    ((kind = 'council' and directory_scope.can_edit_council(id, parent_id))
      or (kind in ('stake', 'ward', 'branch') and parent_id in (select directory_scope.unit_ids())))
    and (building_id is null or exists (select 1 from public.buildings b where b.id = building_id))));
drop policy if exists council_unit_deletes on public.units;
create policy council_unit_deletes on public.units as restrictive for delete to authenticated
  using ((select public.directory_role()) = 'admin' or
    (kind in ('stake', 'ward', 'branch') and id in (select directory_scope.unit_ids())));

drop policy if exists council_contact_reads on public.contacts;
create policy council_contact_reads on public.contacts as restrictive for select to authenticated
  using ((select public.directory_role()) = 'admin' or
    directory_scope.contact_visible(id, ward_id, home_ward_id, created_by_email));
drop policy if exists council_contact_inserts on public.contacts;
create policy council_contact_inserts on public.contacts as restrictive for insert to authenticated
  with check ((select public.directory_role()) = 'admin' or (
    created_by_email = (select directory_scope.viewer_email())
    and (ward_id is null or ward_id in (select directory_scope.unit_ids()))));
drop policy if exists council_contact_updates on public.contacts;
create policy council_contact_updates on public.contacts as restrictive for update to authenticated
  using ((select public.directory_role()) = 'admin' or
    directory_scope.contact_visible(id, ward_id, home_ward_id, created_by_email))
  with check ((select public.directory_role()) = 'admin' or
    directory_scope.contact_visible(id, ward_id, home_ward_id, created_by_email));
drop policy if exists council_contact_deletes on public.contacts;
create policy council_contact_deletes on public.contacts as restrictive for delete to authenticated
  using ((select public.directory_role()) = 'admin' or
    directory_scope.contact_visible(id, ward_id, home_ward_id, created_by_email));

drop policy if exists council_building_reads on public.buildings;
create policy council_building_reads on public.buildings as restrictive for select to authenticated
  using ((select public.directory_role()) = 'admin' or
    directory_scope.building_visible(id, agent_stake_id, created_by_email));
drop policy if exists council_building_inserts on public.buildings;
create policy council_building_inserts on public.buildings as restrictive for insert to authenticated
  with check ((select public.directory_role()) = 'admin' or created_by_email = (select directory_scope.viewer_email()));
drop policy if exists council_building_updates on public.buildings;
create policy council_building_updates on public.buildings as restrictive for update to authenticated
  using ((select public.directory_role()) = 'admin' or
    directory_scope.building_visible(id, agent_stake_id, created_by_email))
  with check ((select public.directory_role()) = 'admin' or
    directory_scope.building_visible(id, agent_stake_id, created_by_email));
drop policy if exists council_building_deletes on public.buildings;
create policy council_building_deletes on public.buildings as restrictive for delete to authenticated
  using ((select public.directory_role()) = 'admin' or
    directory_scope.building_visible(id, agent_stake_id, created_by_email));

do $$
declare scoped record;
begin
  for scoped in select * from (values
    ('positions', 'unit_id'),
    ('stake_conferences', 'stake_id'),
    ('ward_conferences', 'unit_id'),
    ('family_history_reports', 'unit_id'),
    ('get_involved_reports', 'unit_id'),
    ('unit_journal_entries', 'unit_id'),
    ('directory_organizations', 'agent_id')
  ) as relations(table_name, unit_column)
  loop
    execute format('drop policy if exists council_scope on public.%I', scoped.table_name);
    execute format('create policy council_scope on public.%I as restrictive for all to authenticated
      using ((select public.directory_role()) = ''admin'' or %I in (select directory_scope.unit_ids()))
      with check ((select public.directory_role()) = ''admin'' or %I in (select directory_scope.unit_ids()))',
      scoped.table_name, scoped.unit_column, scoped.unit_column);
  end loop;
end;
$$;

drop policy if exists scoped_organization_building on public.directory_organizations;
create policy scoped_organization_building on public.directory_organizations as restrictive for all to authenticated
  using (true)
  with check (building_id is null or exists (select 1 from public.buildings b where b.id = building_id));

-- Child records inherit the RLS of their parent.
do $$
declare scoped record;
begin
  for scoped in select * from (values
    ('assignments', 'positions', 'position_id', 'id'),
    ('assignment_buildings', 'assignments', 'assignment_id', 'id'),
    ('focus_person_activity', 'contacts', 'contact_id', 'id'),
    ('organization_titles', 'directory_organizations', 'organization_id', 'id'),
    ('organization_events', 'directory_organizations', 'organization_id', 'id'),
    ('organization_journal_entries', 'directory_organizations', 'organization_id', 'id'),
    ('organization_assignments', 'organization_titles', 'title_id', 'id')
  ) as relations(table_name, parent_table, parent_column, parent_key)
  loop
    execute format('drop policy if exists council_scope on public.%I', scoped.table_name);
    execute format('create policy council_scope on public.%I as restrictive for all to authenticated
      using (%I in (select %I from public.%I))', scoped.table_name, scoped.parent_column,
      scoped.parent_key, scoped.parent_table);
  end loop;
end;
$$;

drop policy if exists scoped_assignment_contact on public.assignments;
create policy scoped_assignment_contact on public.assignments as restrictive for insert to authenticated
  with check (contact_id in (select id from public.contacts));
drop policy if exists scoped_organization_assignment_contact on public.organization_assignments;
create policy scoped_organization_assignment_contact on public.organization_assignments as restrictive for insert to authenticated
  with check (contact_id in (select id from public.contacts));
drop policy if exists scoped_scheduler_building on public.assignment_buildings;
create policy scoped_scheduler_building on public.assignment_buildings as restrictive for insert to authenticated
  with check (building_id in (select id from public.buildings));

drop policy if exists council_visit_scope on public.visit_events;
create policy council_visit_scope on public.visit_events as restrictive for all to authenticated
  using ((unit_id is null and owner_id = (select auth.uid()) and (select directory_scope.preview_email()) is null)
    or (unit_id is not null and ((select public.directory_role()) = 'admin' or unit_id in (select directory_scope.unit_ids()))));

create or replace function directory_scope.building_photo_in_use(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.buildings where photo_path = path)
$$;

drop policy if exists directory_reads_building_photos on storage.objects;
create policy directory_reads_building_photos on storage.objects for select to authenticated
  using (bucket_id = 'buildings' and (select public.directory_role()) is not null and (
    exists (select 1 from public.buildings b where b.photo_path = objects.name)
    or ((select directory_scope.preview_email()) is null and not directory_scope.building_photo_in_use(name)
      and ((select public.directory_role()) = 'admin' or owner_id::text = (select auth.uid())::text
        or exists (select 1 from public.buildings b where b.id::text = split_part(objects.name, '/', 1))))));

drop policy if exists directory_deletes_unused_building_photos on storage.objects;
create policy directory_deletes_unused_building_photos on storage.objects for delete to authenticated
  using (bucket_id = 'buildings' and (select public.directory_role()) is not null
    and (select directory_scope.preview_email()) is null and not directory_scope.building_photo_in_use(name)
    and ((select public.directory_role()) = 'admin' or owner_id::text = (select auth.uid())::text
      or exists (select 1 from public.buildings b where b.id::text = split_part(objects.name, '/', 1))));

-- An admin preview uses the member's read scope and never writes, even via the API.
do $$
declare relation text;
begin
  foreach relation in array array[
    'units', 'contacts', 'buildings', 'languages', 'calling_types', 'organizations', 'positions',
    'assignments', 'assignment_buildings', 'stake_conferences', 'ward_conferences',
    'family_history_reports', 'get_involved_reports', 'unit_journal_entries', 'directory_organizations',
    'organization_titles', 'organization_events', 'organization_journal_entries', 'organization_assignments',
    'focus_person_activity', 'visit_events', 'calendar_events', 'private_calendar_events', 'email_dispatches'
  ]
  loop
    execute format('drop policy if exists preview_read_only_insert on public.%I', relation);
    execute format('drop policy if exists preview_read_only_update on public.%I', relation);
    execute format('drop policy if exists preview_read_only_delete on public.%I', relation);
    execute format('create policy preview_read_only_insert on public.%I as restrictive for insert to authenticated
      with check ((select directory_scope.preview_email()) is null)', relation);
    execute format('create policy preview_read_only_update on public.%I as restrictive for update to authenticated
      using ((select directory_scope.preview_email()) is null) with check ((select directory_scope.preview_email()) is null)', relation);
    execute format('create policy preview_read_only_delete on public.%I as restrictive for delete to authenticated
      using ((select directory_scope.preview_email()) is null)', relation);
  end loop;
end;
$$;
drop policy if exists preview_hides_private_events on public.private_calendar_events;
create policy preview_hides_private_events on public.private_calendar_events as restrictive for select to authenticated
  using ((select directory_scope.preview_email()) is null);
drop policy if exists preview_hides_email_dispatches on public.email_dispatches;
create policy preview_hides_email_dispatches on public.email_dispatches as restrictive for select to authenticated
  using ((select directory_scope.preview_email()) is null);
drop policy if exists preview_blocks_building_upload on storage.objects;
create policy preview_blocks_building_upload on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'buildings' or (select directory_scope.preview_email()) is null);

create or replace function public.directory_can_email(recipient_addresses text[]) returns boolean
language sql stable set search_path = '' as $$
  select (select public.directory_role()) is not null
    and (select directory_scope.preview_email()) is null
    and not exists (
      select 1 from unnest(recipient_addresses) as recipient(address)
      where not exists (select 1 from public.contacts where lower(email) = recipient.address)
    )
$$;
revoke all on function public.directory_can_email(text[]) from public, anon;
grant execute on function public.directory_can_email(text[]) to authenticated;

create or replace function public.record_accepted_batch(dispatch_id uuid, batch_number integer) returns void
language sql security definer set search_path = '' as $$
  update public.email_dispatches
  set accepted_batches = array_append(accepted_batches, batch_number)
  where id = dispatch_id and sender_id = auth.uid() and (select public.directory_role()) is not null
    and (select directory_scope.preview_email()) is null
    and batch_number >= 0 and batch_number * 100::bigint < cardinality(recipients)
    and not (batch_number = any(accepted_batches))
$$;

revoke all on all functions in schema directory_scope from public, anon;
grant execute on all functions in schema directory_scope to authenticated;

notify pgrst, 'reload schema';

commit;
