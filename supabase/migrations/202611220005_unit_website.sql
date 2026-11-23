alter table public.units
  add column website_url text,
  add constraint unit_website_url_allowed check (
    website_url is null or (
      kind in ('stake', 'ward', 'branch')
      and length(website_url) <= 2048
      and website_url ~* '^https?://[^[:space:]]+$'
    )
  );
