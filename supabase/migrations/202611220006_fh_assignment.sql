alter table public.positions
  add column fh_assignment boolean not null default false,
  add constraint fh_assignment_allowed check (
    not fh_assignment or level in ('stake', 'ward')
  );
