-- 0040_scenario_injection.sql — issue #13, "the highest demo-value endpoint
-- in the project" per ROADMAP.md, never built.
--
-- Rather than a live-simulator modifier (the Railway simulator only runs 3
-- standalone demo meters that aren't part of any DT — a live fault there
-- would never reach dt_loss_summary()), this writes the anomaly directly
-- into meter_readings for a real seeded consumer meter. It works whether
-- or not the Railway telemetry pipeline is even running, and it reuses the
-- exact signal shape scripts/seed_discom_fleet.mjs already plants for
-- AHD-A-300001 / DT A-23 (see DATA.md §4.3): register under-report +
-- tamper bit 0x08, the DT-head meter unaffected — so dt_loss_summary()'s
-- loss_pct widens and dt_consumer_breakdown() ranks the target meter,
-- live, in front of the jury.

create table scenario_events (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references meters (id),
  scenario text not null check (scenario in ('theft', 'soiling', 'inverter_trip', 'tamper')),
  magnitude numeric,
  injected_by uuid references auth.users (id),
  injected_at timestamptz not null default now(),
  note text
);

alter table scenario_events enable row level security;
alter table scenario_events force row level security;

-- Demo-control audit trail — platform_admin only, same boundary as every
-- other cross-tenant surface (0038).
create policy scenario_events_admin_only on scenario_events
  for select to authenticated
  using (is_platform_admin());

revoke all on scenario_events from anon;

-- ============================================================
-- inject_scenario() — one call, one anomaly, logged.
-- ============================================================

create function inject_scenario(p_meter_serial text, p_scenario text, p_magnitude numeric default 0.4)
  returns scenario_events
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_meter meters%rowtype;
  v_now timestamptz := now();
  v_baseline numeric;
  v_event scenario_events;
begin
  if not is_platform_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  if p_magnitude is null or p_magnitude <= 0 or p_magnitude > 1 then
    raise exception 'magnitude must be in (0, 1]';
  end if;

  select * into v_meter from meters where serial = p_meter_serial;
  if not found then
    raise exception 'no meter with serial %', p_meter_serial;
  end if;

  -- The anomaly is proportional to how this specific meter actually
  -- behaves over the last week, not an arbitrary constant — so a 5 kW
  -- connection and a 50 kW connection both get a believable injection.
  select coalesce(avg(delta_import_kwh), 1.0) into v_baseline
  from meter_readings
  where meter_id = v_meter.id and reading_ts > v_now - interval '7 days';

  if p_scenario = 'theft' then
    -- Register under-report vs what the DT actually delivered — exactly
    -- the residual dt_loss_summary() / dt_consumer_breakdown() are built
    -- to surface. Tamper bit 0x08 (cover/magnetic), matching the
    -- convention the seeded AHD-A-300001 defect already uses.
    insert into meter_readings (meter_id, reading_ts, delta_import_kwh, interval_seconds, source, quality, tamper_flags)
    values (v_meter.id, v_now, round(v_baseline * (1 - p_magnitude), 3), 900, 'meter', 'suspect', 8);

  elsif p_scenario = 'soiling' then
    -- A ramp, not a cliff — dust/soiling degrades generation gradually.
    -- Four readings at 15-minute spacing ending now, each lower than the
    -- last, so the analytics trend line visibly bends before the jury's
    -- eyes rather than jumping once.
    insert into meter_readings (meter_id, reading_ts, delta_export_kwh, interval_seconds, source, quality)
    select
      v_meter.id,
      v_now - ((4 - n) * interval '15 minutes'),
      round(greatest(0, v_baseline * (1 - p_magnitude * n / 4.0)), 3),
      900, 'meter', 'good'
    from generate_series(1, 4) as n;

  elsif p_scenario = 'inverter_trip' then
    -- A cliff, not a ramp — the inverter stops exporting outright.
    insert into meter_readings (meter_id, reading_ts, delta_export_kwh, interval_seconds, source, quality)
    values (v_meter.id, v_now, 0, 900, 'meter', 'suspect');

  elsif p_scenario = 'tamper' then
    -- Flag only — a magnetic/cover event with no register effect, the
    -- "raised, under investigation" case distinct from confirmed theft.
    insert into meter_readings (meter_id, reading_ts, delta_import_kwh, interval_seconds, source, quality, tamper_flags)
    values (v_meter.id, v_now, v_baseline, 900, 'meter', 'suspect', 8);

  else
    raise exception 'unknown scenario %', p_scenario;
  end if;

  insert into scenario_events (meter_id, scenario, magnitude, injected_by)
  values (v_meter.id, p_scenario, p_magnitude, auth.uid())
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function inject_scenario(text, text, numeric) from public, anon;
grant execute on function inject_scenario(text, text, numeric) to authenticated;
