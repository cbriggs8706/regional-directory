create domain public.report_percentage as numeric
  check (value between 0 and 100);
create domain public.report_member_count as integer
  check (value >= 0);

create table public.family_history_reports (
  unit_id uuid not null,
  unit_level public.calling_level generated always as ('ward'::public.calling_level) stored,
  report_month date not null check (extract(day from report_month) = 1),
  revision uuid not null default gen_random_uuid(),
  submitters public.report_member_count,
  first_four_generations public.report_percentage,
  first_four_members public.report_member_count,
  familysearch_logins public.report_member_count,
  added_ancestor public.report_member_count,
  added_memory public.report_member_count,
  total_percent public.report_percentage,
  total_members public.report_member_count,
  adults_submitters public.report_member_count,
  adults_percent public.report_percentage,
  adults_members public.report_member_count,
  youth_submitters public.report_member_count,
  youth_percent public.report_percentage,
  youth_members public.report_member_count,
  converts_submitters public.report_member_count,
  converts_percent public.report_percentage,
  converts_members public.report_member_count,
  ysa_submitters public.report_member_count,
  ysa_percent public.report_percentage,
  ysa_members public.report_member_count,
  primary key (unit_id, report_month),
  foreign key (unit_id, unit_level) references public.units (id, level),
  check (num_nonnulls(submitters, first_four_generations, familysearch_logins, added_ancestor,
    added_memory, total_percent, adults_percent, youth_percent, converts_percent, ysa_percent,
    adults_submitters, youth_submitters, converts_submitters, ysa_submitters) > 0),
  check (submitters <= total_members),
  check (first_four_members <> 0 or first_four_generations = 0),
  check (total_members <> 0 or total_percent = 0),
  check (adults_submitters <= adults_members),
  check (adults_members <> 0 or adults_percent = 0),
  check (youth_submitters <= youth_members),
  check (youth_members <> 0 or youth_percent = 0),
  check (converts_submitters <= converts_members),
  check (converts_members <> 0 or converts_percent = 0),
  check (ysa_submitters <= ysa_members),
  check (ysa_members <> 0 or ysa_percent = 0)
);

create index family_history_reports_month on public.family_history_reports (report_month, unit_id);
alter table public.family_history_reports enable row level security;
revoke all on public.family_history_reports from anon, authenticated;
grant select, insert, update on public.family_history_reports to authenticated;
create policy directory_members_report_access on public.family_history_reports for all to authenticated
  using ((select public.directory_role()) is not null)
  with check ((select public.directory_role()) is not null);
