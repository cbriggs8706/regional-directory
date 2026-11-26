begin;

-- Keep these legacy columns available to earlier app versions.
alter table public.calling_types alter column default_multiple_holders set default true;
alter table public.positions alter column multiple_holders set default true;
drop trigger if exists default_position_holder_limit on public.positions;
drop function if exists public.default_position_holder_limit();

create or replace function public.check_position() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.unit_id, old.calling_type_id) is distinct from (new.unit_id, new.calling_type_id)
    and exists (select 1 from public.assignments where position_id = old.id) then
    raise exception 'Create a replacement calling to change its unit or type without losing history.';
  end if;

  if new.retired_on is not null and old.retired_on is distinct from new.retired_on
    and exists (select 1 from public.assignments where position_id = old.id and released_on is null) then
    raise exception 'Release the current holders before retiring this calling.';
  end if;
  return new;
end;
$$;

create or replace function public.check_assignment() returns trigger
language plpgsql set search_path = '' as $$
declare retirement_date date;
begin
  if tg_op = 'UPDATE' and (old.position_id, old.contact_id) is distinct from (new.position_id, new.contact_id) then
    raise exception 'Release this assignment and add a new holder to preserve the calling history.';
  end if;

  if new.released_on is null then
    -- Serialize adding a current holder with changes to the position's retirement date.
    update public.positions set retired_on = retired_on
    where id = new.position_id returning retired_on into strict retirement_date;
    if retirement_date is not null then
      raise exception 'This calling is retired.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    select t.name into strict new.calling_name
    from public.positions p join public.calling_types t on t.id = p.calling_type_id
    where p.id = new.position_id;
  else
    new.calling_name := old.calling_name;
  end if;
  return new;
end;
$$;

update public.calling_types set default_multiple_holders = true where not default_multiple_holders;
update public.positions set multiple_holders = true where not multiple_holders;

commit;
