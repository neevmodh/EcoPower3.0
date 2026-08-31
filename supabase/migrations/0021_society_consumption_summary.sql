-- 0021_society_consumption_summary.sql
-- Real bug found live: the Society Overview/Units pages summed
-- meter_readings.delta_import_kwh in JS after a plain .select().in()
-- fetch — PostgREST's default 1000-row cap silently truncated that to
-- one meter's worth of rows out of six, so five units showed 0.0 kWh
-- instead of their real consumption. dt_loss_summary() (0017) already
-- solves this exact class of problem for DT loss; this is the same fix
-- applied here — aggregate in SQL, where there's no row cap, not in JS.
create function society_unit_consumption(p_since timestamptz)
returns table (service_connection_id uuid, consumer_number text, kwh numeric)
language sql stable as $$
  select sc.id, sc.consumer_number, coalesce(sum(mr.delta_import_kwh), 0)
  from service_connections sc
  left join meter_readings mr
    on mr.service_connection_id = sc.id and mr.reading_ts >= p_since
  where sc.society_org_id is not null
  group by sc.id, sc.consumer_number
  order by sc.consumer_number;
$$;

revoke all on function society_unit_consumption(timestamptz) from public, anon;
grant execute on function society_unit_consumption(timestamptz) to authenticated;
