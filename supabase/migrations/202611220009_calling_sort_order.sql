alter table public.calling_types
  add column sort_order integer check (sort_order > 0);

create function public.save_calling_order(calling_scope public.calling_level, ordered_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
begin
  if public.directory_role() is null then
    raise exception 'You need approved directory access.';
  end if;
  if calling_scope not in ('stake', 'ward') or calling_scope is null then
    raise exception 'Choose a stake or ward calling group.';
  end if;

  lock table public.calling_types in share row exclusive mode;
  if coalesce(cardinality(ordered_ids), 0) = 0
    or cardinality(ordered_ids) <> (select count(*) from public.calling_types where level = calling_scope)
    or cardinality(ordered_ids) <> (
      select count(distinct t.id)
      from unnest(ordered_ids) as requested(id)
      join public.calling_types t on t.id = requested.id and t.level = calling_scope
    ) then
    raise exception 'The calling group changed. Close the reorder list, refresh, and try again.';
  end if;

  update public.calling_types t
  set sort_order = requested.rank::integer
  from unnest(ordered_ids) with ordinality as requested(id, rank)
  where t.id = requested.id and t.level = calling_scope;
end;
$$;

revoke all on function public.save_calling_order(public.calling_level, uuid[]) from public, anon;
grant execute on function public.save_calling_order(public.calling_level, uuid[]) to authenticated;
