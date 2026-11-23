alter type public.visit_kind add value 'drive';

alter table public.visit_events
  alter column unit_id drop not null,
  add column title text check (length(btrim(title)) between 1 and 150),
  add constraint visit_drive_details check (
    (kind::text = 'drive' and unit_id is null)
    or (kind::text <> 'drive' and unit_id is not null and title is null)
  );

grant insert (title), update (title) on public.visit_events to authenticated;
