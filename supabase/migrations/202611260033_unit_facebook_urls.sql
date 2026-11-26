begin;

create function public.valid_unit_facebook_urls(urls text[])
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select coalesce(array_ndims(urls), 1) = 1 and not exists (
    select 1 from unnest(urls) as links(url)
    where url is null or length(url) > 2048 or url !~* '^https?://[^[:space:]]+$'
  );
$$;

alter table public.units
  add column facebook_urls text[] not null default '{}',
  add constraint unit_facebook_urls_allowed check (
    cardinality(facebook_urls) = 0 or (
      kind in ('stake', 'ward', 'branch') and public.valid_unit_facebook_urls(facebook_urls)
    )
  );

update public.units
set facebook_urls = array[facebook_url]
where facebook_url is not null;

alter table public.units drop column facebook_url;

commit;
