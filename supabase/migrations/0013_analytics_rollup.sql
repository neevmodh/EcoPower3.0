-- 0013_analytics_rollup.sql
-- daily_energy_summary() — a real server-side rollup over meter_readings,
-- not "fetch 11k raw rows and reduce them in the browser." security
-- invoker (the default — no `security definer` here) means RLS on
-- meter_readings still applies to whoever calls this: a consumer only
-- ever aggregates their own meter's rows, same boundary as everywhere
-- else, enforced by the same policies, not re-implemented here.

create function daily_energy_summary(p_meter_id uuid, p_days int)
returns table (day date, import_kwh numeric, export_kwh numeric)
language sql
stable
as $$
  select
    (reading_ts at time zone 'Asia/Kolkata')::date as day,
    coalesce(sum(delta_import_kwh), 0) as import_kwh,
    coalesce(sum(delta_export_kwh), 0) as export_kwh
  from meter_readings
  where meter_id = p_meter_id
    and reading_ts >= now() - (p_days || ' days')::interval
  group by 1
  order by 1;
$$;

revoke all on function daily_energy_summary(uuid, int) from public, anon;
grant execute on function daily_energy_summary(uuid, int) to authenticated;
