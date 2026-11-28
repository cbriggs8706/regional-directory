begin;

lock table public.calling_types in share row exclusive mode;
-- The normal edit guards prohibit reparenting existing assignments and positions.
alter table public.assignments disable trigger validate_assignment;
alter table public.positions disable trigger validate_position;
lock table public.assignment_buildings in share row exclusive mode;

do $$
declare
  calling_group record;
  source_calling record;
  source_position public.positions%rowtype;
  target_calling_id uuid;
  target_position_id uuid;
begin
  for calling_group in
    select organization.id, spec.counselor_name, spec.numbered_name_pattern
    from public.organizations organization
    join (values
      ('ward', 'bishopric', 'Bishopric Counselor', '^(bishopric )?(first|second|1st|2nd) counselor$'),
      ('stake', 'stake presidency', 'Stake Presidency Counselor', '^(stake presidency )?(first|second|1st|2nd) counselor$')
    ) as spec(level, name, counselor_name, numbered_name_pattern)
      on organization.level = spec.level::public.calling_level and lower(btrim(organization.name)) = spec.name
  loop
    select id into target_calling_id
    from public.calling_types
    where organization_id = calling_group.id
      and lower(btrim(name)) in (lower(calling_group.counselor_name), 'counselor')
    order by (lower(btrim(name)) = lower(calling_group.counselor_name)) desc, sort_order nulls last, id
    limit 1;

    for source_calling in
      select id, name
      from public.calling_types
      where organization_id = calling_group.id
        and lower(btrim(name)) ~ calling_group.numbered_name_pattern
      order by sort_order nulls last, id
    loop
      if target_calling_id is null then
        -- Keep the existing calling and position IDs when there is no shared calling yet.
        update public.calling_types set name = calling_group.counselor_name where id = source_calling.id;
        target_calling_id := source_calling.id;
        continue;
      end if;

      for source_position in
        select * from public.positions where calling_type_id = source_calling.id
      loop
        select id into target_position_id
        from public.positions
        where unit_id = source_position.unit_id and calling_type_id = target_calling_id;

        if target_position_id is null then
          update public.positions set calling_type_id = target_calling_id where id = source_position.id;
          continue;
        end if;

        if source_position.retired_on is null then
          update public.positions set retired_on = null, successor_id = null
          where id = target_position_id and retired_on is not null;
        end if;

        -- If the same contact holds both active positions, retain one assignment with both sets of details.
        update public.assignments target
        set assignment_labels = array(
              select label
              from unnest(target.assignment_labels || source.assignment_labels) with ordinality as labels(label, ordinal)
              group by label order by min(ordinal)
            ),
            sustained_on = least(target.sustained_on, source.sustained_on)
        from public.assignments source
        where target.position_id = target_position_id and source.position_id = source_position.id
          and target.contact_id = source.contact_id and target.released_on is null and source.released_on is null;

        insert into public.assignment_buildings (assignment_id, building_id)
        select target.id, buildings.building_id
        from public.assignments source
        join public.assignments target on target.contact_id = source.contact_id
        join public.assignment_buildings buildings on buildings.assignment_id = source.id
        where target.position_id = target_position_id and source.position_id = source_position.id
          and target.released_on is null and source.released_on is null
        on conflict do nothing;

        delete from public.assignments source using public.assignments target
        where target.position_id = target_position_id and source.position_id = source_position.id
          and target.contact_id = source.contact_id and target.released_on is null and source.released_on is null;

        update public.assignments set position_id = target_position_id where position_id = source_position.id;
        update public.positions
        set successor_id = nullif(target_position_id, id)
        where successor_id = source_position.id;
        delete from public.positions where id = source_position.id;
      end loop;

      update public.calling_names set calling_type_id = target_calling_id where calling_type_id = source_calling.id;
      insert into public.calling_names (calling_type_id, previous_name) values (target_calling_id, source_calling.name);
      delete from public.calling_types where id = source_calling.id;
    end loop;

    -- Past assignments keep the title recorded during service.
    update public.assignments assignment set calling_name = calling.name
    from public.positions p
    join public.calling_types calling on calling.id = p.calling_type_id
    where calling.id = target_calling_id and assignment.position_id = p.id
      and assignment.released_on is null
      and lower(btrim(assignment.calling_name)) ~ calling_group.numbered_name_pattern;
  end loop;
end;
$$;

alter table public.positions enable trigger validate_position;
alter table public.assignments enable trigger validate_assignment;

commit;
