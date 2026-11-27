begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ward-plans', 'ward-plans', false, 4194304, array['application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.ward_plans (
  id uuid primary key,
  unit_id uuid not null,
  unit_level public.calling_level generated always as ('ward'::public.calling_level) stored,
  filename text not null check (length(filename) between 1 and 255 and filename ~* '\.pdf$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (unit_id, unit_level) references public.units (id, level)
);
create index ward_plans_unit_archive on public.ward_plans (unit_id, created_at desc, id desc);

alter table public.ward_plans enable row level security;
revoke all on public.ward_plans from public, anon, authenticated;
grant select on public.ward_plans to authenticated;
grant insert (id, unit_id, filename) on public.ward_plans to authenticated;

create policy read_ward_plans on public.ward_plans for select to authenticated
  using ((select public.directory_role()) = 'admin' or unit_id in (select directory_scope.unit_ids()));

create policy read_ward_plan_files on storage.objects for select to authenticated
  using (bucket_id = 'ward-plans' and exists (
    select 1 from public.units
    where level = 'ward' and id::text = split_part(objects.name, '/', 1)
  ));

create policy upload_ward_plan_files on storage.objects for insert to authenticated
  with check (bucket_id = 'ward-plans'
    and (select directory_scope.preview_email()) is null
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    and exists (
      select 1 from public.units
      where level = 'ward' and id::text = split_part(objects.name, '/', 1)
    ));

create function directory_scope.owns_ward_plan_file(unit_id uuid, plan_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from storage.objects
    where bucket_id = 'ward-plans' and name = unit_id::text || '/' || plan_id::text || '.pdf'
      and owner_id::text = (select auth.uid())::text
  )
$$;
revoke all on function directory_scope.owns_ward_plan_file(uuid, uuid) from public, anon;
grant execute on function directory_scope.owns_ward_plan_file(uuid, uuid) to authenticated;

create policy publish_ward_plans on public.ward_plans for insert to authenticated
  with check ((select directory_scope.preview_email()) is null
    and ((select public.directory_role()) = 'admin' or unit_id in (select directory_scope.unit_ids()))
    and directory_scope.owns_ward_plan_file(unit_id, id));

-- Incomplete uploads can be cleaned up by their uploader. Published versions are immutable.
create policy delete_unpublished_ward_plan_files on storage.objects for delete to authenticated
  using (bucket_id = 'ward-plans' and owner_id::text = (select auth.uid())::text
    and (select directory_scope.preview_email()) is null
    and exists (
      select 1 from public.units
      where level = 'ward' and id::text = split_part(objects.name, '/', 1)
    )
    and not exists (
      select 1 from public.ward_plans
      where unit_id::text = split_part(objects.name, '/', 1) and id::text || '.pdf' = split_part(objects.name, '/', 2)
    ));

notify pgrst, 'reload schema';

commit;
