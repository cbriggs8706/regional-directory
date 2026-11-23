alter table public.calling_types
  add column parent_calling_type_id uuid,
  add constraint calling_parent_level foreign key (parent_calling_type_id, level)
    references public.calling_types (id, level),
  add constraint calling_parent_allowed check (
    parent_calling_type_id is null or (level in ('stake', 'ward') and parent_calling_type_id <> id)
  );

drop index public.calling_types_unique_name;
create unique index calling_types_unique_name
  on public.calling_types (level, parent_calling_type_id, lower(btrim(name))) nulls not distinct;
create index calling_types_parent on public.calling_types (parent_calling_type_id);

create function public.check_calling_parent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.parent_calling_type_id is not distinct from old.parent_calling_type_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(516814, 912);
  if exists (
    with recursive ancestors as (
      select id, parent_calling_type_id from public.calling_types where id = new.parent_calling_type_id
      union
      select t.id, t.parent_calling_type_id
      from public.calling_types t join ancestors a on t.id = a.parent_calling_type_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A calling cannot be nested under one of its own child callings.';
  end if;
  return new;
end;
$$;
create trigger validate_calling_parent before insert or update of parent_calling_type_id on public.calling_types
  for each row execute function public.check_calling_parent();
revoke all on function public.check_calling_parent() from public, anon, authenticated;

create or replace function public.check_fh_assignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.fh_assignment then
    return new;
  end if;
  -- Keep previous marks when editing an unrelated field on an existing assignment.
  if tg_op = 'UPDATE' and old.fh_assignment and old.position_id = new.position_id then
    return new;
  end if;
  if not exists (
    select 1 from public.positions p
    join public.calling_types t on t.id = p.calling_type_id
    where p.id = new.position_id and t.parent_calling_type_id is not null
  ) then
    raise exception 'FH Assignment is available only for people in nested callings.';
  end if;
  return new;
end;
$$;
