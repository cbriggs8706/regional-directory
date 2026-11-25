begin;

alter table public.languages add column if not exists color text;

update public.languages
set color = case lower(btrim(name))
  when 'english' then 'green'
  when 'spanish' then 'red'
  when 'chuukese' then 'orange'
  when 'chukeese' then 'orange'
  when 'swahili' then 'purple'
  else 'gray'
end
where color is null;

alter table public.languages
  alter column color set default 'gray',
  alter column color set not null,
  drop constraint if exists languages_color_check;

alter table public.languages
  add constraint languages_color_check
  check (color in ('gray', 'green', 'red', 'orange', 'purple', 'blue', 'teal', 'yellow', 'pink'));

commit;
