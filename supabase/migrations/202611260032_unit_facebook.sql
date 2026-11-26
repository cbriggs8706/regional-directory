alter table public.units
  add column facebook_url text,
  add constraint unit_facebook_url_allowed check (
    facebook_url is null or (
      kind in ('stake', 'ward', 'branch')
      and length(facebook_url) <= 2048
      and facebook_url ~* '^https?://[^[:space:]]+$'
    )
  );
