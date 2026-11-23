alter table public.units
  add column has_sub_congregation boolean not null default false,
  add column sub_congregation_language_id uuid references public.languages,
  add constraint valid_sub_congregation check (
    has_sub_congregation = (sub_congregation_language_id is not null)
    and (
      not has_sub_congregation
      or (kind in ('ward', 'branch') and sub_congregation_language_id is distinct from language_id)
    )
  );

create index units_sub_congregation_language_id on public.units (sub_congregation_language_id)
  where sub_congregation_language_id is not null;
