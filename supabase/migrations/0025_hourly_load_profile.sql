-- 0025_hourly_load_profile.sql
-- The consumer analytics surface had one daily rollup (daily_energy_summary,
-- 0013) and nothing below day granularity — so "when in the day do I actually
-- draw from the grid" had no honest answer and the dashboard fell back to a
-- single number. This adds the hour-of-day / day-of-week profile the load
-- heatmap and the 24h layered-area chart both read from.
--
-- Same discipline as 0013 and 0021: aggregate in SQL where there is no row
-- cap, security invoker so RLS on meter_readings still confines a consumer
-- to their own meter. The output is an AVERAGE per (dow, hour) bucket —
-- total kWh in that bucket divided by the number of distinct local dates
-- that contributed — so it reads as "a typical Tuesday 7pm", not a sum that
-- grows with the window.
create function hourly_load_profile(p_meter_id uuid, p_days int)
returns table (
  dow int,              -- 0 = Sunday .. 6 = Saturday, in Asia/Kolkata
  hour int,             -- 0 .. 23, local
  avg_import_kwh numeric,
  avg_export_kwh numeric,
  samples bigint
)
language sql
stable
as $$
  with local_reads as (
    select
      (reading_ts at time zone 'Asia/Kolkata') as local_ts,
      delta_import_kwh,
      delta_export_kwh
    from meter_readings
    where meter_id = p_meter_id
      and reading_ts >= now() - (p_days || ' days')::interval
  )
  select
    extract(dow from local_ts)::int as dow,
    extract(hour from local_ts)::int as hour,
    round(
      coalesce(sum(delta_import_kwh), 0) / nullif(count(distinct local_ts::date), 0),
      4
    ) as avg_import_kwh,
    round(
      coalesce(sum(delta_export_kwh), 0) / nullif(count(distinct local_ts::date), 0),
      4
    ) as avg_export_kwh,
    count(*) as samples
  from local_reads
  group by 1, 2
  order by 1, 2;
$$;

revoke all on function hourly_load_profile(uuid, int) from public, anon;
grant execute on function hourly_load_profile(uuid, int) to authenticated;
