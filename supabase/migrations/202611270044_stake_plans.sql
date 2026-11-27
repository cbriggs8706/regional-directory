begin;

-- Existing ward rows keep their unit level, foreign key, and file paths.
alter table public.ward_plans
  alter column unit_level drop expression,
  alter column unit_level set default 'ward',
  alter column unit_level set not null,
  add constraint ward_plans_supported_unit_levels check (unit_level in ('ward', 'stake'));
grant insert (unit_level) on public.ward_plans to authenticated;

drop policy read_ward_plan_files on storage.objects;
drop policy upload_ward_plan_files on storage.objects;
drop policy delete_unpublished_ward_plan_files on storage.objects;

create policy read_ward_plan_files on storage.objects for select to authenticated
  using (bucket_id = 'ward-plans' and exists (
    select 1 from public.units
    where level in ('stake', 'ward') and id::text = split_part(objects.name, '/', 1)
  ));

create policy upload_ward_plan_files on storage.objects for insert to authenticated
  with check (bucket_id = 'ward-plans'
    and (select directory_scope.preview_email()) is null
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    and exists (
      select 1 from public.units
      where level in ('stake', 'ward') and id::text = split_part(objects.name, '/', 1)
    ));

create policy delete_unpublished_ward_plan_files on storage.objects for delete to authenticated
  using (bucket_id = 'ward-plans' and owner_id::text = (select auth.uid())::text
    and (select directory_scope.preview_email()) is null
    and exists (
      select 1 from public.units
      where level in ('stake', 'ward') and id::text = split_part(objects.name, '/', 1)
    )
    and not exists (
      select 1 from public.ward_plans
      where unit_id::text = split_part(objects.name, '/', 1) and id::text || '.pdf' = split_part(objects.name, '/', 2)
    ));

notify pgrst, 'reload schema';

commit;
