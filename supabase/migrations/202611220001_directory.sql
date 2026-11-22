create type public.unit_kind as enum ('region', 'council', 'stake', 'ward', 'branch');
create type public.calling_level as enum ('region', 'council', 'stake', 'ward');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 150),
  kind public.unit_kind not null,
  parent_id uuid,
  parent_kind public.unit_kind generated always as (
    case kind when 'council' then 'region'::public.unit_kind
      when 'stake' then 'council'::public.unit_kind
      when 'ward' then 'stake'::public.unit_kind
      when 'branch' then 'stake'::public.unit_kind end
  ) stored,
  level public.calling_level generated always as (
    case kind when 'region' then 'region'::public.calling_level
      when 'council' then 'council'::public.calling_level
      when 'stake' then 'stake'::public.calling_level
      else 'ward'::public.calling_level end
  ) stored,
  unique (id, kind),
  unique (id, level),
  check ((kind = 'region') = (parent_id is null)),
  foreign key (parent_id, parent_kind) references public.units (id, kind)
);
create unique index units_unique_name on public.units (parent_id, kind, lower(btrim(name))) nulls not distinct;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 150),
  email text check (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text check (length(phone) <= 50)
);

create table public.calling_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 150),
  level public.calling_level not null,
  unique (id, level)
);
create unique index calling_types_unique_name on public.calling_types (level, lower(btrim(name)));

create table public.calling_names (
  id bigint generated always as identity primary key,
  calling_type_id uuid not null references public.calling_types on delete cascade,
  previous_name text not null,
  changed_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  calling_type_id uuid not null,
  level public.calling_level not null,
  multiple_holders boolean not null default false,
  retired_on date,
  successor_id uuid references public.positions (id),
  unique (unit_id, calling_type_id),
  foreign key (unit_id, level) references public.units (id, level),
  foreign key (calling_type_id, level) references public.calling_types (id, level),
  check (successor_id is null or (successor_id <> id and retired_on is not null))
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions,
  contact_id uuid not null references public.contacts,
  calling_name text not null,
  sustained_on date,
  released_on date,
  check (released_on is null or sustained_on is null or released_on >= sustained_on)
);
create index assignments_contact on public.assignments (contact_id);
create index assignments_position on public.assignments (position_id);
create unique index assignments_one_active_per_contact on public.assignments (position_id, contact_id)
  where released_on is null;

create table public.directory_access (
  email text primary key check (email = lower(btrim(email)) and length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  is_admin boolean not null default false
);
create unique index directory_single_admin on public.directory_access (is_admin) where is_admin;

create function public.directory_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when is_admin then 'admin' else 'member' end
  from public.directory_access
  where auth.uid() is not null
    and auth.jwt() -> 'app_metadata' ->> 'provider' = 'google'
    and email = lower(auth.jwt() ->> 'email')
$$;

revoke all on function public.directory_role() from public, anon;
grant execute on function public.directory_role() to authenticated;

alter table public.directory_access enable row level security;
revoke all on public.directory_access from anon, authenticated;
grant select, insert, delete on public.directory_access to authenticated;
create policy admin_reads_access on public.directory_access for select to authenticated
  using ((select public.directory_role()) = 'admin');
create policy admin_grants_access on public.directory_access for insert to authenticated
  with check ((select public.directory_role()) = 'admin' and not is_admin);
create policy admin_revokes_access on public.directory_access for delete to authenticated
  using ((select public.directory_role()) = 'admin' and not is_admin);

do $$
declare relation text;
begin
  foreach relation in array array['units', 'contacts', 'calling_types', 'positions', 'assignments'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from anon, authenticated', relation);
    execute format('grant select, insert, update, delete on public.%I to authenticated', relation);
    execute format('create policy directory_members on public.%I for all to authenticated
      using ((select public.directory_role()) is not null)
      with check ((select public.directory_role()) is not null)', relation);
  end loop;
end;
$$;

alter table public.calling_names enable row level security;
revoke all on public.calling_names from anon, authenticated;
grant select on public.calling_names to authenticated;
create policy read_calling_names on public.calling_names for select to authenticated
  using ((select public.directory_role()) is not null);

create function public.record_calling_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.calling_names (calling_type_id, previous_name) values (old.id, old.name);
  return new;
end;
$$;
create trigger remember_calling_name after update of name on public.calling_types
  for each row when (old.name is distinct from new.name) execute function public.record_calling_name();

create function public.check_position() returns trigger
language plpgsql set search_path = '' as $$
declare active_count bigint;
begin
  if tg_op = 'UPDATE' and (old.unit_id, old.calling_type_id) is distinct from (new.unit_id, new.calling_type_id)
    and exists (select 1 from public.assignments where position_id = old.id) then
    raise exception 'Create a replacement calling to change its unit or type without losing history.';
  end if;

  if tg_op = 'UPDATE' and (old.multiple_holders, old.retired_on) is distinct from (new.multiple_holders, new.retired_on) then
    select count(*) into active_count from public.assignments where position_id = old.id and released_on is null;
    if new.retired_on is not null and active_count > 0 then
      raise exception 'Release the current holders before retiring this calling.';
    end if;
    if not new.multiple_holders and active_count > 1 then
      raise exception 'This calling still has multiple current holders.';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_position before update on public.positions
  for each row execute function public.check_position();

create function public.check_assignment() returns trigger
language plpgsql set search_path = '' as $$
declare position public.positions%rowtype;
begin
  if tg_op = 'UPDATE' and (old.position_id, old.contact_id) is distinct from (new.position_id, new.contact_id) then
    raise exception 'Release this assignment and add a new holder to preserve the calling history.';
  end if;

  if new.released_on is null then
    -- Updating the parent row serializes capacity checks and changes to the position.
    update public.positions set multiple_holders = multiple_holders
    where id = new.position_id returning * into strict position;
    if position.retired_on is not null then
      raise exception 'This calling is retired.';
    end if;
    if not position.multiple_holders and exists (
      select 1 from public.assignments
      where position_id = new.position_id and released_on is null and id <> new.id
    ) then
      raise exception 'Release the current holder before adding another person.';
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
create trigger validate_assignment before insert or update on public.assignments
  for each row execute function public.check_assignment();

revoke all on function public.record_calling_name(), public.check_position(), public.check_assignment() from public, anon, authenticated;

create table public.email_dispatches (
  id uuid primary key,
  sender_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  subject text not null check (length(subject) between 1 and 200),
  body text not null check (length(body) between 1 and 20000),
  from_address text not null,
  reply_to text not null default (auth.jwt() ->> 'email'),
  recipients text[] not null check (cardinality(recipients) between 1 and 1000),
  accepted_batches integer[] not null default '{}'
);
alter table public.email_dispatches enable row level security;
revoke all on public.email_dispatches from anon, authenticated;
grant select on public.email_dispatches to authenticated;
grant insert (id, subject, body, from_address, recipients) on public.email_dispatches to authenticated;
create policy read_own_dispatches on public.email_dispatches for select to authenticated
  using ((select public.directory_role()) is not null and sender_id = (select auth.uid()));
create policy create_own_dispatches on public.email_dispatches for insert to authenticated
  with check ((select public.directory_role()) is not null and sender_id = (select auth.uid()));

create function public.validate_dispatch_recipients() returns trigger
language plpgsql set search_path = '' as $$
begin
  if array_ndims(new.recipients) is distinct from 1
    or cardinality(new.recipients) <> (select count(distinct address) from unnest(new.recipients) as address)
    or exists (
      select 1 from unnest(new.recipients) as address
      where not exists (select 1 from public.contacts where lower(email) = address)
    ) then
    raise exception 'Recipients must be distinct email addresses from the directory.';
  end if;
  return new;
end;
$$;
create trigger check_dispatch_recipients before insert on public.email_dispatches
  for each row execute function public.validate_dispatch_recipients();
revoke all on function public.validate_dispatch_recipients() from public, anon, authenticated;

create function public.record_accepted_batch(dispatch_id uuid, batch_number integer) returns void
language sql security definer set search_path = '' as $$
  update public.email_dispatches
  set accepted_batches = array_append(accepted_batches, batch_number)
  where id = dispatch_id and sender_id = auth.uid() and (select public.directory_role()) is not null
    and batch_number >= 0 and batch_number * 100::bigint < cardinality(recipients)
    and not (batch_number = any(accepted_batches))
$$;
revoke all on function public.record_accepted_batch(uuid, integer) from public, anon;
grant execute on function public.record_accepted_batch(uuid, integer) to authenticated;
