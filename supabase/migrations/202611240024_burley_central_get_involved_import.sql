-- Get Involved counts from the six ward PDFs, January 2025 through November 24, 2026.
-- Requires 202611240022_get_involved_reports.sql. Safe to rerun.
-- If a ward does not match, replace its null::uuid below with the ID from its report URL.
with sources (source_key, pdf_ward, ordinal_pattern, ward_id) as (
  values
    ('burley_2', 'Burley 2nd Ward', '(2|2nd|second)', null::uuid),
    ('burley_6', 'Burley 6th Ward', '(6|6th|sixth)', null::uuid),
    ('burley_7', 'Burley 7th Ward', '(7|7th|seventh)', null::uuid),
    ('burley_8', 'Burley 8th Ward', '(8|8th|eighth)', null::uuid),
    ('burley_9', 'Burley 9th Ward', '(9|9th|ninth)', null::uuid),
    ('cassia', 'Cassia Ward (Spanish)', null, null::uuid)
), wards as (
  select ward.id, ward.name, stake.name as stake_name,
    regexp_replace(lower(ward.name), '[^a-z0-9]', '', 'g') as ward_name_key,
    regexp_replace(lower(stake.name), '[^a-z0-9]', '', 'g') as stake_name_key
  from public.units as ward
  left join public.units as stake on stake.id = ward.parent_id
  where ward.kind = 'ward'
), matches as (
  select source.source_key, ward.id, ward.name, ward.stake_name,
    count(*) over (partition by source.source_key) as match_count
  from sources as source
  join wards as ward on case
    when source.ward_id is not null then ward.id = source.ward_id
    when source.source_key = 'cassia' then ward.ward_name_key ~ '^cassia(ward|spanish|wardspanish|spanishward)?$'
    else ward.ward_name_key ~ ('^burley(idaho)?' || source.ordinal_pattern || '(ward)?$')
      or (ward.stake_name_key ~ '^burley(idaho)?central(stake)?$'
        and ward.ward_name_key ~ ('^' || source.ordinal_pattern || '(ward)?$'))
  end
), unique_matches as (
  select *, count(*) over (partition by id) as source_count
  from matches where match_count = 1
), targets as (
  select source_key, id, name, stake_name
  from unique_matches where source_count = 1
), monthly_counts (source_key, report_month, participants, quick_name_reviews, full_name_reviews,
  family_reviews, verified_places, record_hint_reviews, indexed_or_reviewed) as (
  values
    ('burley_2', date '2025-01-01', 2, 19, 0, 0, 9, 0, 3214),
    ('burley_2', date '2025-02-01', 3, 43, 0, 0, 0, 0, 3481),
    ('burley_2', date '2025-03-01', 2, 0, 0, 0, 0, 0, 2425),
    ('burley_2', date '2025-04-01', 2, 240, 150, 0, 6, 0, 609),
    ('burley_2', date '2025-05-01', 4, 400, 804, 0, 518, 0, 0),
    ('burley_2', date '2025-06-01', 2, 1704, 1245, 0, 717, 0, 0),
    ('burley_2', date '2025-07-01', 2, 65, 930, 0, 254, 0, 0),
    ('burley_2', date '2025-08-01', 2, 220, 1500, 0, 132, 0, 0),
    ('burley_2', date '2025-09-01', 3, 261, 2368, 0, 199, 0, 0),
    ('burley_2', date '2025-10-01', 2, 118, 1917, 0, 972, 0, 0),
    ('burley_2', date '2025-11-01', 3, 247, 917, 0, 1193, 0, 0),
    ('burley_2', date '2025-12-01', 3, 738, 1174, 0, 750, 0, 0),
    ('burley_2', date '2026-01-01', 3, 894, 548, 0, 1590, 0, 0),
    ('burley_2', date '2026-02-01', 5, 6913, 562, 0, 1176, 0, 0),
    ('burley_2', date '2026-03-01', 7, 5336, 175, 0, 1166, 1, 0),
    ('burley_2', date '2026-04-01', 3, 853, 11, 0, 2168, 0, 0),
    ('burley_2', date '2026-05-01', 2, 143, 182, 0, 2394, 0, 0),
    ('burley_2', date '2026-06-01', 3, 379, 1485, 0, 397, 0, 0),
    ('burley_2', date '2026-07-01', 6, 1231, 1299, 0, 1005, 0, 0),
    ('burley_2', date '2026-08-01', 3, 2788, 1445, 0, 717, 0, 0),
    ('burley_2', date '2026-09-01', 3, 1253, 170, 0, 536, 0, 0),
    ('burley_2', date '2026-10-01', 3, 1946, 1177, 0, 1022, 0, 0),
    ('burley_2', date '2026-11-01', 3, 1585, 836, 0, 658, 0, 0),
    ('burley_6', date '2025-01-01', 6, 605, 6, 0, 0, 0, 1210),
    ('burley_6', date '2025-02-01', 4, 260, 0, 0, 11, 0, 6491),
    ('burley_6', date '2025-03-01', 5, 826, 0, 0, 0, 0, 8756),
    ('burley_6', date '2025-04-01', 3, 523, 0, 0, 0, 0, 325),
    ('burley_6', date '2025-05-01', 1, 160, 0, 0, 0, 0, 0),
    ('burley_6', date '2025-06-01', 3, 530, 35, 0, 0, 0, 0),
    ('burley_6', date '2025-07-01', 3, 459, 0, 0, 0, 0, 0),
    ('burley_6', date '2025-08-01', 1, 673, 0, 0, 0, 0, 0),
    ('burley_6', date '2025-09-01', 2, 468, 0, 0, 0, 0, 0),
    ('burley_6', date '2025-10-01', 1, 93, 0, 0, 0, 0, 0),
    ('burley_6', date '2025-11-01', 2, 17, 0, 0, 2, 0, 0),
    ('burley_6', date '2025-12-01', 2, 185, 2, 0, 161, 0, 0),
    ('burley_6', date '2026-01-01', 4, 472, 5, 0, 100, 0, 0),
    ('burley_6', date '2026-02-01', 4, 863, 2, 0, 106, 0, 0),
    ('burley_6', date '2026-03-01', 2, 2086, 0, 0, 0, 0, 0),
    ('burley_6', date '2026-04-01', 2, 2155, 0, 0, 1, 0, 0),
    ('burley_6', date '2026-05-01', 2, 1450, 0, 0, 0, 0, 0),
    ('burley_6', date '2026-06-01', 3, 694, 0, 0, 0, 0, 0),
    ('burley_6', date '2026-07-01', 6, 887, 0, 0, 0, 0, 0),
    ('burley_6', date '2026-08-01', 4, 1002, 0, 0, 35, 0, 0),
    ('burley_6', date '2026-09-01', 4, 674, 0, 0, 0, 1, 0),
    ('burley_6', date '2026-10-01', 4, 2686, 0, 0, 0, 0, 0),
    ('burley_6', date '2026-11-01', 3, 918, 0, 0, 0, 0, 0),
    ('burley_7', date '2025-01-01', 2, 344, 0, 0, 0, 0, 208),
    ('burley_7', date '2025-02-01', 3, 2887, 0, 0, 0, 0, 0),
    ('burley_7', date '2025-03-01', 4, 2269, 0, 0, 0, 0, 292),
    ('burley_7', date '2025-04-01', 2, 2137, 1, 10, 17, 4, 147),
    ('burley_7', date '2025-05-01', 5, 676, 0, 2, 0, 2, 0),
    ('burley_7', date '2025-06-01', 4, 1028, 0, 0, 10, 0, 0),
    ('burley_7', date '2025-07-01', 5, 1545, 0, 0, 0, 3, 0),
    ('burley_7', date '2025-08-01', 3, 1393, 0, 0, 8, 0, 0),
    ('burley_7', date '2025-09-01', 2, 1508, 0, 0, 0, 0, 0),
    ('burley_7', date '2025-10-01', 5, 549, 39, 0, 5, 1, 0),
    ('burley_7', date '2025-11-01', 4, 1503, 0, 0, 31, 0, 0),
    ('burley_7', date '2025-12-01', 4, 1187, 0, 0, 0, 0, 0),
    ('burley_7', date '2026-01-01', 6, 2254, 80, 0, 10, 0, 0),
    ('burley_7', date '2026-02-01', 5, 1671, 5, 0, 0, 0, 0),
    ('burley_7', date '2026-03-01', 3, 567, 0, 0, 0, 0, 0),
    ('burley_7', date '2026-04-01', 2, 390, 0, 0, 0, 0, 0),
    ('burley_7', date '2026-05-01', 4, 595, 0, 0, 2, 0, 0),
    ('burley_7', date '2026-06-01', 3, 312, 11, 0, 1, 0, 0),
    ('burley_7', date '2026-07-01', 2, 755, 0, 0, 0, 1, 0),
    ('burley_7', date '2026-08-01', 2, 844, 0, 0, 14, 0, 0),
    ('burley_7', date '2026-09-01', 3, 415, 0, 0, 0, 0, 0),
    ('burley_7', date '2026-10-01', 4, 510, 0, 0, 20, 1, 0),
    ('burley_7', date '2026-11-01', 3, 571, 0, 0, 0, 0, 0),
    ('burley_8', date '2025-01-01', 2, 0, 0, 0, 0, 0, 612),
    ('burley_8', date '2025-02-01', 2, 0, 0, 0, 0, 0, 351),
    ('burley_8', date '2025-03-01', 3, 0, 0, 0, 0, 0, 575),
    ('burley_8', date '2025-04-01', 4, 720, 158, 0, 0, 0, 0),
    ('burley_8', date '2025-05-01', 3, 549, 602, 0, 3, 0, 0),
    ('burley_8', date '2025-06-01', 5, 941, 71, 0, 28, 0, 0),
    ('burley_8', date '2025-07-01', 4, 1552, 469, 0, 24, 0, 0),
    ('burley_8', date '2025-08-01', 4, 1246, 184, 0, 0, 0, 0),
    ('burley_8', date '2025-09-01', 3, 489, 295, 0, 0, 0, 0),
    ('burley_8', date '2025-10-01', 2, 433, 619, 0, 10, 0, 0),
    ('burley_8', date '2025-11-01', 1, 17, 0, 0, 0, 0, 0),
    ('burley_8', date '2025-12-01', 2, 109, 0, 0, 10, 0, 0),
    ('burley_8', date '2026-01-01', 1, 2, 0, 0, 0, 0, 0),
    ('burley_8', date '2026-02-01', 4, 582, 10, 0, 10, 0, 0),
    ('burley_8', date '2026-03-01', 3, 498, 0, 0, 0, 0, 0),
    ('burley_8', date '2026-04-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_8', date '2026-05-01', 1, 179, 0, 0, 0, 0, 0),
    ('burley_8', date '2026-06-01', 6, 120, 6, 0, 17, 0, 0),
    ('burley_8', date '2026-07-01', 1, 20, 0, 0, 0, 0, 0),
    ('burley_8', date '2026-08-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_8', date '2026-09-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_8', date '2026-10-01', 1, 1, 0, 0, 0, 0, 0),
    ('burley_8', date '2026-11-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-01-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-02-01', 1, 89, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-03-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-04-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-05-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-06-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-07-01', 1, 136, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-08-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-09-01', 1, 85, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-10-01', 1, 122, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-11-01', 1, 20, 0, 0, 0, 0, 0),
    ('burley_9', date '2025-12-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-01-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-02-01', 3, 45, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-03-01', 1, 42, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-04-01', 1, 3, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-05-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-06-01', 1, 143, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-07-01', 0, 0, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-08-01', 1, 915, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-09-01', 1, 1680, 0, 0, 0, 0, 0),
    ('burley_9', date '2026-10-01', 2, 2763, 6, 0, 0, 0, 0),
    ('burley_9', date '2026-11-01', 2, 1331, 0, 0, 0, 0, 0),
    ('cassia', date '2025-01-01', 1, 1319, 0, 0, 0, 0, 0),
    ('cassia', date '2025-02-01', 1, 1150, 0, 0, 0, 0, 0),
    ('cassia', date '2025-03-01', 1, 920, 0, 0, 0, 0, 0),
    ('cassia', date '2025-04-01', 2, 2008, 0, 0, 0, 0, 0),
    ('cassia', date '2025-05-01', 2, 14734, 0, 0, 0, 0, 0),
    ('cassia', date '2025-06-01', 1, 1454, 0, 0, 0, 0, 0),
    ('cassia', date '2025-07-01', 1, 50, 0, 0, 0, 0, 0),
    ('cassia', date '2025-08-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2025-09-01', 1, 0, 0, 0, 0, 15, 0),
    ('cassia', date '2025-10-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2025-11-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2025-12-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-01-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-02-01', 1, 50, 0, 0, 5, 0, 0),
    ('cassia', date '2026-03-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-04-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-05-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-06-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-07-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-08-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-09-01', 1, 56, 26, 0, 0, 0, 0),
    ('cassia', date '2026-10-01', 0, 0, 0, 0, 0, 0, 0),
    ('cassia', date '2026-11-01', 0, 0, 0, 0, 0, 0, 0)
), written as (
  insert into public.get_involved_reports as existing (unit_id, report_month, participants, quick_name_reviews,
    full_name_reviews, family_reviews, verified_places, record_hint_reviews, indexed_or_reviewed)
  select target.id, counts.report_month, counts.participants, counts.quick_name_reviews, counts.full_name_reviews,
    counts.family_reviews, counts.verified_places, counts.record_hint_reviews, counts.indexed_or_reviewed
  from monthly_counts as counts join targets as target using (source_key)
  on conflict (unit_id, report_month) do update set
    participants = coalesce(existing.participants, excluded.participants),
    quick_name_reviews = coalesce(existing.quick_name_reviews, excluded.quick_name_reviews),
    full_name_reviews = coalesce(existing.full_name_reviews, excluded.full_name_reviews),
    family_reviews = coalesce(existing.family_reviews, excluded.family_reviews),
    verified_places = coalesce(existing.verified_places, excluded.verified_places),
    record_hint_reviews = coalesce(existing.record_hint_reviews, excluded.record_hint_reviews),
    indexed_or_reviewed = coalesce(existing.indexed_or_reviewed, excluded.indexed_or_reviewed),
    revision = gen_random_uuid()
  where num_nonnulls(existing.participants, existing.quick_name_reviews, existing.full_name_reviews,
    existing.family_reviews, existing.verified_places, existing.record_hint_reviews, existing.indexed_or_reviewed) < 7
  returning unit_id, report_month
), saved as (
  select unit_id, report_month from written
  union
  select report.unit_id, report.report_month
  from public.get_involved_reports as report
  join targets as target on target.id = report.unit_id
  join monthly_counts as counts on counts.source_key = target.source_key and counts.report_month = report.report_month
), written_totals as (
  select unit_id, count(*) as months_written from written group by unit_id
), saved_totals as (
  select unit_id, count(*) as months_present from saved group by unit_id
)
select source.pdf_ward, target.name as matched_ward, target.stake_name as stake,
  '/units/' || target.id || '?section=get-involved' as report_path,
  coalesce(written_totals.months_written, 0) as months_written,
  coalesce(saved_totals.months_present, 0) as months_present,
  case
    when target.id is not null and saved_totals.months_present = 23 then 'Ready'
    when target.id is not null then 'Some months are missing. Run again to verify.'
    when exists (select 1 from unique_matches as candidate where candidate.source_key = source.source_key and candidate.source_count > 1)
      then 'This ward is matched to multiple PDFs. Check the ward ID overrides.'
    when exists (select 1 from matches as candidate where candidate.source_key = source.source_key)
      then 'Multiple wards match. Set the ward ID from its report URL.'
    else 'No ward matched. Set the ward ID from its report URL.'
  end as result
from sources as source
left join targets as target using (source_key)
left join written_totals on written_totals.unit_id = target.id
left join saved_totals on saved_totals.unit_id = target.id
order by source.source_key;
