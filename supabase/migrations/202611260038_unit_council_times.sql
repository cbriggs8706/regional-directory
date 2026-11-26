alter table public.units
  add column tfh_coordinating_council_time time(0) without time zone,
  add column stake_council_time time(0) without time zone,
  add constraint tfh_coordinating_council_time_allowed check (
    tfh_coordinating_council_time is null or (
      kind in ('ward', 'branch')
      and tfh_coordinating_council_time < time '24:00'
      and extract(second from tfh_coordinating_council_time) = 0
    )
  ),
  add constraint stake_council_time_allowed check (
    stake_council_time is null or (
      kind = 'stake'
      and stake_council_time < time '24:00'
      and extract(second from stake_council_time) = 0
    )
  );
