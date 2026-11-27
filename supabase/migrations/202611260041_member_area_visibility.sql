begin;

-- Area rows provide the shared hierarchy. The existing scope still controls
-- council descendants, area-level records, and all writes.
drop policy if exists council_unit_reads on public.units;
create policy council_unit_reads on public.units as restrictive for select to authenticated
  using ((select public.directory_role()) = 'admin'
    or (kind = 'region' and (select public.directory_role()) = 'member')
    or id in (select directory_scope.unit_ids())
    or (kind in ('stake', 'ward', 'branch') and parent_id in (select directory_scope.unit_ids())));

commit;
