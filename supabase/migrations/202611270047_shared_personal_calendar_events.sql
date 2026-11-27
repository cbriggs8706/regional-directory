begin;

-- Return only calendar fields for accounts in the viewer's existing access list.
create function public.shared_personal_calendar_events(from_date date, until_date date)
returns table (id uuid, owner_email text, title text, event_date date, end_date date)
language sql stable security definer set search_path = '' as $$
  select event.id, lower(account.email), event.title, event.event_date, event.end_date
  from auth.users account
  join public.private_calendar_events event on event.owner_id = account.id
  where lower(account.email) = any ((select public.calendar_visit_accounts())::text[])
    and account.raw_app_meta_data ->> 'provider' = 'google'
    and until_date > from_date and until_date <= from_date + 31
    and event.event_date < until_date
    and coalesce(event.end_date, event.event_date) >= from_date
$$;

revoke all on function public.shared_personal_calendar_events(date, date) from public, anon;
grant execute on function public.shared_personal_calendar_events(date, date) to authenticated;

commit;
