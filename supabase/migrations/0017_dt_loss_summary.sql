-- 0017_dt_loss_summary.sql
-- dt_loss_summary() — real AT&C-style loss per DT: delivered (from a
-- DT-head meter, meters.dt_id) vs consumed (summed from that DT's
-- consumer meters, meters.service_connection_id -> service_connections
-- .dt_id). security invoker (the default) — RLS on meter_readings and
-- meters still applies to whoever calls this, so a discom_officer only
-- ever sees their own division's DTs, the same boundary as every direct
-- query, not re-implemented here.
--
-- #26's full scope (DT energy accounting + AT&C loss map) is bigger than
-- this — proper time-aligned interval reconciliation, technical-vs-
-- commercial loss split, T&D loss vs pure DT loss. This is the real,
-- correctly-computed total-period version: delivered and consumed over
-- all retained readings, which is what the DISCOM overview/loss-map pages
-- need today. Not a placeholder — every number is a real aggregate query,
-- just not yet interval-windowed.

create function dt_loss_summary()
returns table (dt_id uuid, dt_name text, delivered_kwh numeric, consumed_kwh numeric, loss_pct numeric)
language sql
stable
as $$
  with dt_head as (
    select m.dt_id, sum(mr.delta_import_kwh) as delivered_kwh
    from meters m
    join meter_readings mr on mr.meter_id = m.id
    where m.dt_id is not null
    group by m.dt_id
  ),
  consumer_sum as (
    select sc.dt_id, sum(mr.delta_import_kwh) as consumed_kwh
    from meters m
    join service_connections sc on sc.id = m.service_connection_id
    join meter_readings mr on mr.meter_id = m.id
    group by sc.dt_id
  )
  select
    dt.id as dt_id,
    dt.name as dt_name,
    coalesce(dh.delivered_kwh, 0) as delivered_kwh,
    coalesce(cs.consumed_kwh, 0) as consumed_kwh,
    case when coalesce(dh.delivered_kwh, 0) > 0
      then round((100 * (dh.delivered_kwh - coalesce(cs.consumed_kwh, 0)) / dh.delivered_kwh)::numeric, 1)
      else null
    end as loss_pct
  from distribution_transformers dt
  join dt_head dh on dh.dt_id = dt.id
  left join consumer_sum cs on cs.dt_id = dt.id
  order by loss_pct desc nulls last;
$$;

revoke all on function dt_loss_summary() from public, anon;
grant execute on function dt_loss_summary() to authenticated;
