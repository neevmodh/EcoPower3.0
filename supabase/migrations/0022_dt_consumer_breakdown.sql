-- 0022_dt_consumer_breakdown.sql
-- dt_consumer_breakdown(p_dt_id) — the drill-down under dt_loss_summary()'s
-- loss map (#27, deterministic form). Given one DT, list every consumer
-- meter on it with the signals that localize where the DT's unaccounted
-- energy is going, ranked worst-first.
--
-- This is NOT an ML model and does not claim to identify theft. It ranks
-- consumers by *observable meter signals* that an investigator would use
-- to decide whom to visit first:
--   • tamper_events   — readings with a non-zero tamper_flags bitfield
--   • suspect_readings — readings the HES marked 'suspect'/'missing' (VEE)
--   • meter_status    — a 'faulty'/'inactive' meter on a live connection
--                       is unmetered draw by definition
--   • reporting_gap   — meter silent for >3 days while the DT is live
--   • low_vs_cohort   — active, non-exporting meter whose consumption per
--                       sanctioned kW is in the bottom quartile *of this
--                       DT's own consumers* — a relative outlier, no
--                       external load-factor assumption baked in
--
-- security invoker (default): RLS on meters / meter_readings /
-- service_connections still applies, so a discom_officer only ever gets a
-- breakdown for a DT in their own division — same boundary as
-- dt_loss_summary(), not re-implemented here.

create function dt_consumer_breakdown(p_dt_id uuid)
returns table (
  service_connection_id uuid,
  consumer_number text,
  meter_serial text,
  meter_status text,
  sanctioned_load_kw numeric,
  consumed_kwh numeric,
  last_reading_ts timestamptz,
  tamper_events bigint,
  suspect_readings bigint,
  suspicion_score int,
  suspicion_reasons text[]
)
language sql
stable
as $$
  with per_consumer as (
    select
      sc.id as service_connection_id,
      sc.consumer_number,
      m.serial as meter_serial,
      m.status as meter_status,
      sc.sanctioned_load_kw,
      coalesce(sum(mr.delta_import_kwh), 0)::numeric as consumed_kwh,
      coalesce(sum(mr.delta_export_kwh), 0)::numeric as exported_kwh,
      max(mr.reading_ts) as last_reading_ts,
      count(*) filter (where coalesce(mr.tamper_flags, 0) <> 0) as tamper_events,
      count(*) filter (where mr.quality in ('suspect', 'missing')) as suspect_readings
    from service_connections sc
    join meters m on m.service_connection_id = sc.id
    left join meter_readings mr on mr.meter_id = m.id
    where sc.dt_id = p_dt_id
    group by sc.id, sc.consumer_number, m.serial, m.status, sc.sanctioned_load_kw
  ),
  cohort_stats as (
    select
      percentile_cont(0.25) within group (
        order by case when pc.sanctioned_load_kw > 0 then pc.consumed_kwh / pc.sanctioned_load_kw end
      ) as cohort_q1,
      max(pc.last_reading_ts) as dt_last_reading_ts
    from per_consumer pc
  ),
  cohort as (
    select
      pc.*,
      case when pc.sanctioned_load_kw > 0 then pc.consumed_kwh / pc.sanctioned_load_kw else null end as kwh_per_kw,
      cs.cohort_q1,
      cs.dt_last_reading_ts
    from per_consumer pc
    cross join cohort_stats cs
  )
  select
    c.service_connection_id,
    c.consumer_number,
    c.meter_serial,
    c.meter_status,
    c.sanctioned_load_kw,
    round(c.consumed_kwh, 3) as consumed_kwh,
    c.last_reading_ts,
    c.tamper_events,
    c.suspect_readings,
    least(100,
      (case when c.tamper_events > 0 then 40 else 0 end)
      + (case when c.suspect_readings > 0 then 15 else 0 end)
      + (case when c.meter_status in ('faulty', 'inactive') then 25 else 0 end)
      + (case when c.last_reading_ts is null
                or c.last_reading_ts < c.dt_last_reading_ts - interval '3 days' then 15 else 0 end)
      + (case when c.meter_status = 'active' and c.exported_kwh = 0
                and c.cohort_q1 is not null and c.kwh_per_kw is not null
                and c.kwh_per_kw <= c.cohort_q1 then 20 else 0 end)
    )::int as suspicion_score,
    (
      array_remove(array[
        case when c.tamper_events > 0 then 'tamper flags on ' || c.tamper_events || ' reading(s)' end,
        case when c.suspect_readings > 0 then c.suspect_readings || ' suspect/missing reading(s)' end,
        case when c.meter_status in ('faulty', 'inactive') then 'meter ' || c.meter_status || ' on a live connection' end,
        case when c.last_reading_ts is null then 'never reported'
             when c.last_reading_ts < c.dt_last_reading_ts - interval '3 days' then 'silent >3 days' end,
        case when c.meter_status = 'active' and c.exported_kwh = 0
              and c.cohort_q1 is not null and c.kwh_per_kw is not null
              and c.kwh_per_kw <= c.cohort_q1 then 'consumption per kW in this DT''s bottom quartile' end
      ], null)
    ) as suspicion_reasons
  from cohort c
  order by suspicion_score desc, c.consumed_kwh asc;
$$;

revoke all on function dt_consumer_breakdown(uuid) from public, anon;
grant execute on function dt_consumer_breakdown(uuid) to authenticated;
