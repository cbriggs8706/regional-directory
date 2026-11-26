alter table public.organization_events
  add column end_date date,
  add constraint organization_events_end_date_check
    check (end_date is null or end_date between event_date and date '9999-12-31');
