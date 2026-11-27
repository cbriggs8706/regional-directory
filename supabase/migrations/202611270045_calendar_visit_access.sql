begin;

create table public.directory_calendar_visit_access (
  viewer_email text not null references public.directory_access(email) on delete cascade,
  owner_email text not null references public.directory_access(email) on delete cascade,
  primary key (viewer_email, owner_email),
  check (viewer_email <> owner_email)
);

alter table public.directory_calendar_visit_access enable row level security;
revoke all on public.directory_calendar_visit_access from public, anon, authenticated;
grant select on public.directory_calendar_visit_access to authenticated;
create policy admin_reads_calendar_visit_access on public.directory_calendar_visit_access
  for select to authenticated using ((select public.directory_role()) = 'admin');

create function public.calendar_visit_accounts() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(owner_email order by owner_email), '{}'::text[])
  from public.directory_calendar_visit_access
  where viewer_email = (select directory_scope.viewer_email())
    and (select public.directory_role()) is not null
    and (select directory_scope.preview_email()) is null
$$;

revoke all on function public.calendar_visit_accounts() from public, anon;
grant execute on function public.calendar_visit_accounts() to authenticated;

create function public.save_calendar_visit_access(account_email text, visible_emails text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.directory_role() is distinct from 'admin' then
    raise insufficient_privilege using message = 'Only the administrator can manage calendar access.';
  end if;

  perform 1 from public.directory_access where email = account_email for no key update;
  if not found then
    raise exception 'This account is no longer available.';
  end if;

  delete from public.directory_calendar_visit_access where viewer_email = account_email;
  insert into public.directory_calendar_visit_access (viewer_email, owner_email)
  select distinct account_email, owner_email
  from unnest(visible_emails) as accounts(owner_email);
end;
$$;

revoke all on function public.save_calendar_visit_access(text, text[]) from public, anon;
grant execute on function public.save_calendar_visit_access(text, text[]) to authenticated;

create policy calendar_visit_visibility on public.visit_events as restrictive for select to authenticated
  using ((select directory_scope.preview_email()) is null and (
    owner_id = (select auth.uid())
    or (unit_id is not null and lower(owner_email) = any ((select public.calendar_visit_accounts())::text[]))
  ));

commit;
