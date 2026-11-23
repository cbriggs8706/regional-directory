alter table public.buildings
  add column city text,
  add column state text not null default 'ID' check (state ~ '^[A-Z]{2}$'),
  add column zip_code text,
  add column agent_stake_id uuid,
  add column agent_stake_kind public.unit_kind generated always as ('stake'::public.unit_kind) stored,
  add column photo_path text,
  add constraint buildings_agent_stake_fkey foreign key (agent_stake_id, agent_stake_kind)
    references public.units (id, kind),
  add constraint buildings_photo_path check (photo_path like id::text || '/%');

-- Require complete addresses on new and edited rows while preserving legacy street addresses.
alter table public.buildings add constraint buildings_complete_address check (
  city is not null and length(btrim(city)) between 1 and 150
  and zip_code is not null and zip_code ~ '^[0-9]{5}(-[0-9]{4})?$'
) not valid;

drop index public.buildings_unique_address;
create unique index buildings_unique_address on public.buildings
  (lower(btrim(address)), lower(btrim(city)), state, left(zip_code, 5));
create index buildings_agent_stake on public.buildings (agent_stake_id) where agent_stake_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('buildings', 'buildings', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy directory_reads_building_photos on storage.objects for select to authenticated
  using (bucket_id = 'buildings' and (select public.directory_role()) is not null);
create policy directory_uploads_building_photos on storage.objects for insert to authenticated
  with check (bucket_id = 'buildings' and (select public.directory_role()) is not null);
create policy directory_deletes_unused_building_photos on storage.objects for delete to authenticated
  using (bucket_id = 'buildings' and (select public.directory_role()) is not null
    and not exists (select 1 from public.buildings where photo_path = objects.name));
