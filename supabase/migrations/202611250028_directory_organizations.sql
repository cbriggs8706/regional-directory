create table public.directory_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 150),
  type text not null check (length(btrim(type)) between 1 and 100),
  agent_id uuid not null,
  agent_kind public.unit_kind not null check (agent_kind in ('region', 'council', 'stake')),
  building_id uuid references public.buildings (id) on delete set null,
  website_url text check (length(website_url) <= 2048 and website_url ~* '^https?://'),
  notes text check (length(notes) <= 10000),
  foreign key (agent_id, agent_kind) references public.units (id, kind) on delete restrict
);
create index directory_organizations_agent on public.directory_organizations (agent_id, agent_kind);
create unique index directory_organizations_name on public.directory_organizations (lower(btrim(name)));

create table public.organization_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.directory_organizations (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 150)
);
create unique index organization_titles_name on public.organization_titles (organization_id, lower(btrim(name)));

create table public.organization_assignments (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.organization_titles (id) on delete restrict,
  contact_id uuid not null references public.contacts (id),
  active boolean not null default true,
  unique (title_id, contact_id)
);
create index organization_assignments_contact on public.organization_assignments (contact_id);

create table public.organization_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.directory_organizations (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 150),
  event_date date not null check (event_date between date '0001-01-01' and date '9999-12-31'),
  start_minute integer check (start_minute between 0 and 1439),
  end_minute integer,
  notes text check (length(notes) <= 10000),
  check (end_minute is null or (start_minute is not null and end_minute > start_minute and end_minute <= 1439))
);
create index organization_events_date on public.organization_events (organization_id, event_date, start_minute, id);

create table public.organization_journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.directory_organizations (id) on delete restrict,
  entry_date date not null default ((now() at time zone 'America/Boise')::date)
    check (entry_date between date '0001-01-01' and date '9999-12-31'),
  notes text not null check (length(notes) <= 10000 and notes ~ '[^[:space:]]'),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  author_name text not null default coalesce(
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
    auth.jwt() ->> 'email'
  ),
  created_at timestamptz not null default now()
);
create index organization_journal_entries_recent
  on public.organization_journal_entries (organization_id, entry_date desc, created_at desc, id desc);
create index organization_journal_entries_author_month
  on public.organization_journal_entries (author_id, entry_date, created_at, id);

do $$
declare relation text;
begin
  foreach relation in array array[
    'directory_organizations', 'organization_titles', 'organization_assignments',
    'organization_events', 'organization_journal_entries'
  ] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from anon, authenticated', relation);
    execute format('create policy directory_members on public.%I for all to authenticated
      using ((select public.directory_role()) is not null)
      with check ((select public.directory_role()) is not null)', relation);
  end loop;
end $$;

grant select, insert, update, delete on public.directory_organizations, public.organization_titles,
  public.organization_events to authenticated;
grant select, insert on public.organization_assignments to authenticated;
grant update (active) on public.organization_assignments to authenticated;
grant select on public.organization_journal_entries to authenticated;
grant insert (organization_id, entry_date, notes), update (entry_date, notes)
  on public.organization_journal_entries to authenticated;
