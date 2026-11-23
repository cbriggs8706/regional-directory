create type public.focus_person_type as enum ('recent_convert', 'person_of_interest');

alter table public.contacts
  add column focus_type public.focus_person_type,
  add column first_name text,
  add column last_name text,
  add column ward_id uuid,
  add column ward_level public.calling_level generated always as ('ward'::public.calling_level) stored,
  add column baptized_on date check (baptized_on between date '0001-01-01' and date '9999-12-31'),
  add column is_whatsapp boolean not null default false,
  add column helper_number text check (helper_number ~ '^[0-9]+$'),
  add column pid text check (pid ~ '^[A-Za-z0-9]+$'),
  add column is_focus_person boolean generated always as (focus_type is not null) stored,
  add constraint contacts_ward_fk foreign key (ward_id, ward_level) references public.units (id, level),
  add constraint contacts_focus_details check (
    focus_type is null or (
      ward_id is not null and first_name is not null and last_name is not null
      and first_name ~ '[^[:space:]]' and last_name ~ '[^[:space:]]'
      and name = btrim(first_name) || ' ' || btrim(last_name)
    )
  ),
  add unique (id, is_focus_person);

create index contacts_focus_ward on public.contacts (ward_id) where focus_type is not null;

-- Preserve past calling records and prevent active assignments for focus people.
alter table public.assignments
  add column active_contact_is_focus boolean generated always as (
    case when released_on is null then false end
  ) stored,
  add constraint assignments_active_contact_fk
    foreign key (contact_id, active_contact_is_focus) references public.contacts (id, is_focus_person);

create index assignments_active_contact on public.assignments (contact_id) where released_on is null;

create table public.focus_person_activity (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  report_month date not null check (
    extract(day from report_month) = 1 and report_month between date '1900-01-01' and date '9999-12-01'
  ),
  revision uuid not null default gen_random_uuid(),
  submitters boolean,
  familysearch_logins boolean,
  added_ancestor boolean,
  added_memory boolean,
  first_four_generations boolean,
  primary key (contact_id, report_month)
);

alter table public.focus_person_activity enable row level security;
revoke all on public.focus_person_activity from anon, authenticated;
grant select, insert on public.focus_person_activity to authenticated;
grant update (revision, submitters, familysearch_logins, added_ancestor, added_memory, first_four_generations)
  on public.focus_person_activity to authenticated;
create policy directory_members_read_focus_activity on public.focus_person_activity for select to authenticated
  using ((select public.directory_role()) is not null);
create policy directory_members_insert_focus_activity on public.focus_person_activity for insert to authenticated
  with check ((select public.directory_role()) is not null and exists (
    select 1 from public.contacts where id = contact_id and is_focus_person
  ));
create policy directory_members_update_focus_activity on public.focus_person_activity for update to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null and exists (
    select 1 from public.contacts where id = contact_id and is_focus_person
  ));
