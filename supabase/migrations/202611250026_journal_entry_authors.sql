alter table public.unit_journal_entries
  add column author_id uuid references auth.users (id) on delete set null;

-- Older entries have only the author label. Leave ambiguous labels unassigned.
with users_by_label as (
  select id, created_at, coalesce(
    nullif(btrim(raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(raw_user_meta_data ->> 'name'), ''),
    email
  ) as author_name
  from auth.users
), unique_authors as (
  select author_name, (array_agg(id))[1] as id, min(created_at) as created_at
  from users_by_label
  group by author_name
  having count(*) = 1
)
update public.unit_journal_entries as entry
set author_id = author.id
from unique_authors as author
where entry.author_name = author.author_name
  and author.created_at <= entry.created_at;

alter table public.unit_journal_entries
  alter column author_id set default auth.uid();

create index unit_journal_entries_author_month
  on public.unit_journal_entries (author_id, entry_date, created_at, id);
