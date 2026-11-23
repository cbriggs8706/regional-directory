create table public.unit_journal_entries (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id),
  entry_date date not null default ((now() at time zone 'America/Boise')::date)
    check (entry_date between date '0001-01-01' and date '9999-12-31'),
  notes text not null check (length(notes) <= 10000 and notes ~ '[^[:space:]]'),
  author_name text not null default coalesce(
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
    auth.jwt() ->> 'email'
  ),
  created_at timestamptz not null default now()
);

create index unit_journal_entries_recent
  on public.unit_journal_entries (unit_id, entry_date desc, created_at desc, id desc);

alter table public.unit_journal_entries enable row level security;
revoke all on public.unit_journal_entries from anon, authenticated;
grant select on public.unit_journal_entries to authenticated;
grant insert (unit_id, entry_date, notes), update (entry_date, notes)
  on public.unit_journal_entries to authenticated;
create policy directory_members_journal_access on public.unit_journal_entries for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);
