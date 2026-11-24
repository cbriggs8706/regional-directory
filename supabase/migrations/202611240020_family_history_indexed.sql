alter table public.family_history_reports
  add column indexed public.report_member_count,
  drop constraint family_history_reports_check,
  add constraint family_history_reports_has_figures check (
    num_nonnulls(submitters, first_four_generations, familysearch_logins, added_ancestor, added_memory,
      indexed, total_percent, adults_percent, youth_percent, converts_percent, ysa_percent,
      adults_submitters, youth_submitters, converts_submitters, ysa_submitters) > 0
  );
