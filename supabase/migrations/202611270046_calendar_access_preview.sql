begin;

create or replace function public.calendar_visit_accounts() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(owner_email order by owner_email), '{}'::text[])
  from public.directory_calendar_visit_access
  where viewer_email = (select directory_scope.viewer_email())
    and (select public.directory_role()) is not null
$$;

alter policy calendar_visit_visibility on public.visit_events
  using (
    (owner_id = (select auth.uid()) and (select directory_scope.preview_email()) is null)
    or (unit_id is not null and (
      lower(owner_email) = (select directory_scope.preview_email())
      or lower(owner_email) = any ((select public.calendar_visit_accounts())::text[])
    ))
  );

commit;
