create table public.languages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 150)
);

create unique index languages_unique_name on public.languages (lower(btrim(name)));

insert into public.languages (name) values ('English'), ('Spanish'), ('Swahili'), ('Chukeese');

alter table public.languages enable row level security;
revoke all on public.languages from anon, authenticated;
grant select, insert, update, delete on public.languages to authenticated;
create policy directory_members on public.languages for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);

alter table public.units
  add column language_id uuid references public.languages,
  add column sacrament_meeting_time time(0) without time zone,
  add column sacrament_meeting_first boolean,
  add column notes text check (length(notes) <= 2000),
  add constraint ward_details_only check (
    kind in ('ward', 'branch')
    or (language_id is null and sacrament_meeting_time is null and sacrament_meeting_first is null and notes is null)
  ),
  add constraint sacrament_meeting_minute check (
    sacrament_meeting_time < time '24:00' and extract(second from sacrament_meeting_time) = 0
  );

create index units_language_id on public.units (language_id) where language_id is not null;
