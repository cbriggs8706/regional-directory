create or replace function public.save_submitter_history(p_unit_id uuid, p_months jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  entry record;
begin
  for entry in
    select * from jsonb_to_recordset(p_months) as months(report_month date, submitters integer, revision uuid)
    order by report_month
  loop
    if entry.submitters is null then
      raise exception 'A submitter count is required.' using errcode = '22023';
    end if;

    begin
      if entry.revision is null then
        insert into public.family_history_reports (unit_id, report_month, submitters)
        values (p_unit_id, entry.report_month, entry.submitters)
        on conflict (unit_id, report_month) do nothing;
      else
        update public.family_history_reports
        set submitters = entry.submitters, revision = gen_random_uuid()
        where unit_id = p_unit_id and report_month = entry.report_month and revision = entry.revision;
      end if;

      if not found then
        raise exception 'A monthly report changed.' using errcode = '40001';
      end if;
    exception when check_violation then
      raise exception 'Invalid submitter count for the monthly report.'
        using errcode = '23514', detail = to_char(entry.report_month, 'YYYY-MM');
    end;
  end loop;
end;
$$;

revoke execute on function public.save_submitter_history(uuid, jsonb) from public, anon;
grant execute on function public.save_submitter_history(uuid, jsonb) to authenticated;
