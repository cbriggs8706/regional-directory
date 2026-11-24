create table public.get_involved_reports (
  unit_id uuid not null,
  unit_level public.calling_level generated always as ('ward'::public.calling_level) stored,
  report_month date not null check (
    extract(day from report_month) = 1 and report_month between date '1900-01-01' and date '9999-12-01'
  ),
  revision uuid not null default gen_random_uuid(),
  participants public.report_member_count,
  quick_name_reviews public.report_member_count,
  full_name_reviews public.report_member_count,
  family_reviews public.report_member_count,
  verified_places public.report_member_count,
  record_hint_reviews public.report_member_count,
  indexed_or_reviewed public.report_member_count,
  primary key (unit_id, report_month),
  foreign key (unit_id, unit_level) references public.units (id, level),
  check (num_nonnulls(participants, quick_name_reviews, full_name_reviews, family_reviews,
    verified_places, record_hint_reviews, indexed_or_reviewed) > 0)
);

alter table public.get_involved_reports enable row level security;
revoke all on public.get_involved_reports from anon, authenticated;
grant select, insert, update on public.get_involved_reports to authenticated;
create policy directory_members_get_involved_reports on public.get_involved_reports for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);
