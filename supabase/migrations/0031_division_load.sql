-- 0031_division_load.sql
-- The DISCOM command centre needs a division-level load curve — net import
-- and behind-meter solar export, bucketed by hour. There was no rollup for
-- it (0013 is per-meter), so the overview only ever showed the AT&C loss
-- ranking.
--
-- SECURITY INVOKER (the default): the aggregation runs under the caller's
-- RLS, so meter_readings_discom_scope (0005) confines it to the officer's
-- own division automatically — no division argument, same discipline as
-- every other query on that surface.

create function division_load_profile(p_hours int default 48)
  returns table (bucket timestamptz, import_kwh numeric, export_kwh numeric, meters int)
  language sql
  stable
as $$
  select
    date_trunc('hour', reading_ts) as bucket,
    coalesce(sum(delta_import_kwh), 0) as import_kwh,
    coalesce(sum(delta_export_kwh), 0) as export_kwh,
    count(distinct meter_id)::int as meters
  from meter_readings
  where reading_ts >= now() - make_interval(hours => greatest(1, least(p_hours, 168)))
    and delta_import_kwh is not null
  group by 1
  order by 1;
$$;

revoke all on function division_load_profile(int) from public, anon;
grant execute on function division_load_profile(int) to authenticated;
