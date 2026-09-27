-- 0061_demand_response_late_reading_resettlement.sql (#163)
-- Closes the other limitation 0059 documented deliberately: once an event
-- flipped to 'completed', a participant whose meter reading for the event
-- window arrived a few minutes after that exact sweep tick (ordinary
-- ingest lag, not an error) settled as unverified/no-data with no later
-- correction pass.
--
-- Deliberately bounded, not a full re-open: only ever revisits a
-- participation that settled UNVERIFIED (verified_by_meter = false), and
-- only within RESETTLE_WINDOW after its event completed. A real,
-- meter-verified settlement is never touched again — this closes the
-- "late data never gets credited" gap without reopening the "already paid,
-- can we take it back" question #41 also declined to solve generally.

-- The settlement computation itself, factored out so the resettlement pass
-- below can reuse it verbatim instead of drifting from the original — same
-- 7-day same-clock-time baseline, same real-data-only gate, same
-- deliberately-not-filtered-to-active-meters join as the comments in 0059
-- already explain in full.
create function dr_settle_participation(p_event demand_response_events, p_participation dr_participations) returns void
language plpgsql
as $$
declare
  v_duration_hours numeric;
  v_baseline_kwh numeric;
  v_baseline_reading_days integer;
  v_actual_kwh numeric;
  v_reading_count integer;
  v_achieved_reduction_kwh numeric;
begin
  v_duration_hours := extract(epoch from (p_event.ends_at - p_event.starts_at)) / 3600.0;

  select avg(daily.kwh) filter (where daily.has_reading), count(*) filter (where daily.has_reading)
  into v_baseline_kwh, v_baseline_reading_days
  from (
    select
      coalesce(sum(mr.delta_import_kwh), 0) as kwh,
      count(mr.*) > 0 as has_reading
    from generate_series(1, 7) as offset_days
    left join public.meters m on m.service_connection_id = p_participation.service_connection_id
    left join public.meter_readings mr on mr.meter_id = m.id
      and mr.reading_ts >= p_event.starts_at - (offset_days || ' days')::interval
      and mr.reading_ts < p_event.ends_at - (offset_days || ' days')::interval
    group by offset_days
  ) daily;

  select coalesce(sum(mr.delta_import_kwh), 0), count(mr.*)
  into v_actual_kwh, v_reading_count
  from public.meters m
  join public.meter_readings mr on mr.meter_id = m.id
    and mr.reading_ts >= p_event.starts_at and mr.reading_ts < p_event.ends_at
  where m.service_connection_id = p_participation.service_connection_id;

  if v_baseline_reading_days is null or v_baseline_reading_days = 0 or v_reading_count = 0 then
    update public.dr_participations
    set verified_by_meter = false, achieved_reduction_kwh = null, incentive_paise = 0, settled_at = now()
    where id = p_participation.id;
  else
    v_achieved_reduction_kwh := greatest(0, v_baseline_kwh - v_actual_kwh);
    update public.dr_participations
    set baseline_kw = case when v_duration_hours > 0 then v_baseline_kwh / v_duration_hours else null end,
        achieved_reduction_kwh = v_achieved_reduction_kwh,
        incentive_paise = round(v_achieved_reduction_kwh * p_event.incentive_paise_per_kwh),
        verified_by_meter = true,
        settled_at = now()
    where id = p_participation.id;
  end if;
end;
$$;

revoke all on function dr_settle_participation(demand_response_events, dr_participations) from public, anon, authenticated;

create or replace function sweep_demand_response_events() returns void as $$
declare
  -- Concrete row types, not `record` — dr_settle_participation() takes
  -- typed composite parameters, and postgres can't implicitly cast a
  -- generic record to a named composite type at the call site.
  v_event public.demand_response_events%rowtype;
  v_participation public.dr_participations%rowtype;
begin
  update public.demand_response_events
  set status = 'active'
  where status = 'scheduled' and starts_at <= now() and ends_at > now();

  for v_event in
    select * from public.demand_response_events
    where status in ('scheduled', 'active') and ends_at <= now()
  loop
    for v_participation in
      select * from public.dr_participations
      where event_id = v_event.id and opted_in and settled_at is null
    loop
      perform public.dr_settle_participation(v_event, v_participation);
    end loop;

    update public.demand_response_events set status = 'completed' where id = v_event.id;
  end loop;

  -- Resettlement (#163): events completed within the last 24 hours, whose
  -- participants settled unverified — retry now that more ingest time has
  -- passed. A participant re-checked here who still has no real data just
  -- gets the identical unverified result written again (settled_at bumped,
  -- nothing else changes) — harmless, and it naturally stops being
  -- selected once either real data lands (verified_by_meter flips true) or
  -- the 24h window closes. 24h, not a few minutes of ordinary ingest lag
  -- headroom, because it costs nothing to keep trying — the WHERE clause
  -- already excludes every already-verified row, so a wider window can
  -- only ever help a genuinely late reader, never re-touch a settled one.
  for v_event in
    select * from public.demand_response_events
    where status = 'completed' and ends_at <= now() and ends_at > now() - interval '24 hours'
  loop
    for v_participation in
      select * from public.dr_participations
      where event_id = v_event.id and opted_in and verified_by_meter = false and settled_at is not null
    loop
      perform public.dr_settle_participation(v_event, v_participation);
    end loop;
  end loop;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function sweep_demand_response_events() from public, anon, authenticated;
