begin;

create function public.valid_organization_social_links(links jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case when jsonb_typeof(links) = 'array' then not exists (
    select 1 from jsonb_array_elements(links) as entries(link)
    where jsonb_typeof(link) <> 'object'
      or not (link ? 'channel' and link ? 'url')
      or jsonb_typeof(link->'channel') <> 'string'
      or link->>'channel' not in ('facebook', 'instagram', 'youtube', 'tiktok', 'x', 'threads',
        'linkedin', 'whatsapp', 'bluesky', 'snapchat', 'twitch', 'other')
      or jsonb_typeof(link->'url') <> 'string'
      or length(link->>'url') > 2048
      or link->>'url' !~* '^https?://[^[:space:]]+$'
  ) else false end;
$$;

alter table public.directory_organizations
  add column social_links jsonb not null default '[]',
  add constraint organization_social_links_valid check (public.valid_organization_social_links(social_links));

commit;
