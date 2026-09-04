-- 0032_resco_generation.sql
-- With 0029 a RESCO operator can read meter_readings for the connections its
-- org services; this adds the fleet-level rollup the Operator overview needs
-- — hourly generation (metered export) across those connections.
--
-- SECURITY INVOKER: meter_readings_resco_scope (0029) confines the
-- aggregation to the caller's serviced fleet with no org argument, exactly
-- as division_load_profile (0031) does for a DISCOM division.

create function resco_generation_profile(p_hours int default 48)
  returns table (bucket timestamptz, generation_kwh numeric, import_kwh numeric, meters int)
  language sql
  stable
as $$
  select
    date_trunc('hour', reading_ts) as bucket,
    coalesce(sum(delta_export_kwh), 0) as generation_kwh,
    coalesce(sum(delta_import_kwh), 0) as import_kwh,
    count(distinct meter_id)::int as meters
  from meter_readings
  where reading_ts >= now() - make_interval(hours => greatest(1, least(p_hours, 168)))
    and delta_export_kwh is not null
  group by 1
  order by 1;
$$;

revoke all on function resco_generation_profile(int) from public, anon;
grant execute on function resco_generation_profile(int) to authenticated;
