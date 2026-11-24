-- Monthly counts transcribed from the Burley 3rd Ward Get Involved report
-- covering January 1, 2025 through November 24, 2026.
-- If the result asks for a ward ID, replace null::uuid with the ID from that ward's URL.
with settings as (
  select null::uuid as ward_id
), wards as (
  select ward.id, ward.name, stake.name as stake_name,
    regexp_replace(lower(ward.name), '[^a-z0-9]', '', 'g') as ward_name_key,
    regexp_replace(lower(stake.name), '[^a-z0-9]', '', 'g') as stake_name_key
  from public.units as ward
  left join public.units as stake on stake.id = ward.parent_id
  where ward.kind = 'ward'
), matching_wards as (
  select ward.id, ward.name, ward.stake_name, count(*) over () as matches
  from wards as ward cross join settings
  where case when settings.ward_id is not null then ward.id = settings.ward_id
    else ward.ward_name_key ~ '^burley(idaho)?(3|3rd|third)(ward)?$'
      or (ward.stake_name_key ~ '^burley(idaho)?central(stake)?$' and ward.ward_name_key ~ '^(3|3rd|third)(ward)?$')
  end
), target as (
  select id, name, stake_name from matching_wards where matches = 1
), monthly_counts (report_month, participants, quick_name_reviews, full_name_reviews, verified_places) as (
  values
    (date '2025-01-01', 0, 0, 0, 0),
    (date '2025-02-01', 0, 0, 0, 0),
    (date '2025-03-01', 0, 0, 0, 0),
    (date '2025-04-01', 0, 0, 0, 0),
    (date '2025-05-01', 1, 0, 0, 88),
    (date '2025-06-01', 0, 0, 0, 0),
    (date '2025-07-01', 0, 0, 0, 0),
    (date '2025-08-01', 1, 39, 0, 0),
    (date '2025-09-01', 3, 554, 2, 1),
    (date '2025-10-01', 2, 135, 0, 57),
    (date '2025-11-01', 1, 564, 0, 20),
    (date '2025-12-01', 2, 300, 0, 0),
    (date '2026-01-01', 4, 243, 0, 0),
    (date '2026-02-01', 2, 127, 35, 0),
    (date '2026-03-01', 3, 660, 83, 0),
    (date '2026-04-01', 1, 20, 0, 0),
    (date '2026-05-01', 1, 13, 0, 0),
    (date '2026-06-01', 0, 0, 0, 0),
    (date '2026-07-01', 0, 0, 0, 0),
    (date '2026-08-01', 1, 14, 0, 0),
    (date '2026-09-01', 1, 20, 0, 0),
    (date '2026-10-01', 0, 0, 0, 0),
    (date '2026-11-01', 0, 0, 0, 0)
), imported as (
  insert into public.get_involved_reports (unit_id, report_month, participants, quick_name_reviews,
    full_name_reviews, family_reviews, verified_places, record_hint_reviews, indexed_or_reviewed)
  select target.id, counts.report_month, counts.participants, counts.quick_name_reviews,
    counts.full_name_reviews, 0, counts.verified_places, 0, 0
  from target cross join monthly_counts as counts
  on conflict (unit_id, report_month) do nothing
  returning report_month
), coverage as (
  select count(*) as saved_months from (
    select report_month from imported
    union
    select report.report_month
    from public.get_involved_reports as report
    join target on target.id = report.unit_id
    join monthly_counts as counts on counts.report_month = report.report_month
  ) as saved
)
select target.name as ward, target.stake_name as stake,
  '/units/' || target.id || '?section=get-involved' as report_path,
  (select count(*) from imported) as months_added, coverage.saved_months as months_present,
  case when target.id is not null and coverage.saved_months = 23 then 'Ready. Open the report_path for this ward.'
    when target.id is not null then 'Run the import again to verify all 23 months.'
    when exists (select 1 from matching_wards) then 'Multiple wards matched. Set settings.ward_id to the correct ward ID and run again.'
    else 'No ward matched. Set settings.ward_id to the Burley 3rd Ward ID from its report URL and run again.'
  end as result
from coverage left join target on true;
