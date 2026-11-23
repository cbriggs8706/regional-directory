alter table public.units
  add column first_meeting_time time(0) without time zone,
  add column council_meeting_time time(0) without time zone,
  add constraint first_meeting_time_allowed check (
    first_meeting_time is null or (
      kind in ('ward', 'branch') and sacrament_meeting_first is false
      and first_meeting_time < time '24:00' and extract(second from first_meeting_time) = 0
    )
  ),
  add constraint council_meeting_time_allowed check (
    council_meeting_time is null or (
      kind in ('ward', 'branch')
      and council_meeting_time < time '24:00' and extract(second from council_meeting_time) = 0
    )
  );

create table public.stake_conferences (
  id uuid primary key default gen_random_uuid(),
  stake_id uuid not null,
  stake_kind public.unit_kind generated always as ('stake'::public.unit_kind) stored,
  begins_on date not null,
  ends_on date not null,
  constraint stake_conference_date_order check (ends_on >= begins_on),
  unique (stake_id, begins_on, ends_on),
  foreign key (stake_id, stake_kind) references public.units (id, kind)
);

alter table public.stake_conferences enable row level security;
revoke all on public.stake_conferences from anon, authenticated;
grant select, insert, update, delete on public.stake_conferences to authenticated;
create policy directory_members on public.stake_conferences for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);
