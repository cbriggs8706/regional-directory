begin;

alter table public.organization_titles
  add column sort_order integer check (sort_order > 0);

grant delete on public.organization_assignments to authenticated;

create function public.delete_organization_assignment(organization uuid, assignment uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if public.directory_role() is null then
    raise insufficient_privilege using message = 'You need approved directory access.';
  end if;

  delete from public.organization_assignments as holder
  using public.organization_titles as title
  where holder.id = assignment and holder.title_id = title.id and title.organization_id = organization;
  return found;
end;
$$;

create function public.save_organization_title_order(organization uuid, ordered_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if public.directory_role() is null then
    raise insufficient_privilege using message = 'You need approved directory access.';
  end if;

  lock table public.organization_titles in share row exclusive mode;
  if coalesce(cardinality(ordered_ids), 0) = 0
    or cardinality(ordered_ids) <> (select count(*) from public.organization_titles where organization_id = organization)
    or cardinality(ordered_ids) <> (
      select count(distinct title.id)
      from unnest(ordered_ids) as requested(id)
      join public.organization_titles as title on title.id = requested.id and title.organization_id = organization
    ) then
    raise invalid_parameter_value using message = 'The assignment titles changed. Refresh and try again.';
  end if;

  update public.organization_titles as title
  set sort_order = requested.rank::integer
  from unnest(ordered_ids) with ordinality as requested(id, rank)
  where title.id = requested.id and title.organization_id = organization;
end;
$$;

revoke all on function public.delete_organization_assignment(uuid, uuid),
  public.save_organization_title_order(uuid, uuid[]) from public, anon;
grant execute on function public.delete_organization_assignment(uuid, uuid),
  public.save_organization_title_order(uuid, uuid[]) to authenticated;

commit;
