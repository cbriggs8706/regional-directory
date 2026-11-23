create table public.ward_conferences (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  unit_level public.calling_level generated always as ('ward'::public.calling_level) stored,
  begins_on date not null,
  ends_on date not null,
  constraint ward_conference_date_order check (ends_on >= begins_on),
  unique (unit_id, begins_on, ends_on),
  foreign key (unit_id, unit_level) references public.units (id, level)
);

alter table public.ward_conferences enable row level security;
revoke all on public.ward_conferences from anon, authenticated;
grant select, insert, update, delete on public.ward_conferences to authenticated;
create policy directory_members on public.ward_conferences for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);
