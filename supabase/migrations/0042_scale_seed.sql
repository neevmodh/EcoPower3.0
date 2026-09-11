-- 0042_scale_seed.sql — issue #58, "Seed 10M+ meter readings ... so on-stage
-- query timings are on real volume, not 500 rows."
--
-- Deliberately NOT invoked here. Every other seed migration (0037's
-- seed_demo_readings, the fleet scripts) runs at apply time because their
-- volume is demo-sized. This one is not — at default parameters it inserts
-- ~10M rows, which would make every `supabase db reset` in CI (run on every
-- push) insert 10M rows too. This migration only defines the function;
-- running it is a deliberate, manual step against an environment you
-- actually want scale numbers from. See tools/loadtest/README.md.

create function seed_scale_readings(p_meter_count int default 4800, p_days int default 90)
  returns bigint
  language plpgsql
as $$
declare
  v_org_id uuid := '99000000-0000-0000-0000-000000000001';
  v_div_id uuid := '99000000-0000-0000-0000-000000000002';
  v_ss_id uuid := '99000000-0000-0000-0000-000000000003';
  v_feeder_id uuid := '99000000-0000-0000-0000-000000000004';
  v_dt_count int := greatest(1, ceil(p_meter_count::numeric / 40)::int);
  v_rows bigint;
begin
  if exists (select 1 from meters where serial like 'LOADTEST-%') then
    raise notice 'seed_scale_readings: LOADTEST- meters already exist, skipping (drop them first to reseed)';
    return 0;
  end if;

  insert into orgs (id, name, type) values (v_org_id, 'Load Test DISCOM', 'discom') on conflict (id) do nothing;
  insert into discom_divisions (id, discom_org_id, name, level)
    values (v_div_id, v_org_id, 'Load Test Division', 'division') on conflict (id) do nothing;
  insert into substations (id, division_id, name) values (v_ss_id, v_div_id, 'Load Test SS') on conflict (id) do nothing;
  insert into feeders (id, substation_id, name) values (v_feeder_id, v_ss_id, 'Load Test Feeder') on conflict (id) do nothing;

  -- Every month this seed's history touches must have a real partition —
  -- exactly what 0039 exists to keep true going forward; walk it backward
  -- here for the historical range this function is about to write into.
  perform create_monthly_partition(d::date)
  from generate_series(
    date_trunc('month', now() - make_interval(days => p_days)),
    date_trunc('month', now()),
    interval '1 month'
  ) as d;

  -- One DT per 40 meters — dt_loss_summary()'s grouping needs real breadth
  -- to be a meaningful timing target, not one giant group.
  insert into distribution_transformers (id, feeder_id, name)
  select
    ('99000000-0001-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
    v_feeder_id,
    'Load Test DT ' || i
  from generate_series(1, v_dt_count) as i
  on conflict (id) do nothing;

  -- Meters + service connections — set-based, not a row-at-a-time loop.
  insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type)
  select
    ('99000000-0002-0000-0000-' || lpad(m::text, 12, '0'))::uuid,
    'LOADTEST-CN-' || m,
    ('99000000-0001-0000-0000-' || lpad((1 + (m % v_dt_count))::text, 12, '0'))::uuid,
    'RGP', 'single', 'postpaid'
  from generate_series(1, p_meter_count) as m;

  insert into meters (id, serial, service_connection_id)
  select
    ('99000000-0003-0000-0000-' || lpad(m::text, 12, '0'))::uuid,
    'LOADTEST-' || m,
    ('99000000-0002-0000-0000-' || lpad(m::text, 12, '0'))::uuid
  from generate_series(1, p_meter_count) as m;

  -- The actual volume: one row per meter per hour for p_days. At the
  -- defaults (4,800 x 90 x 24) this is ~10.37M rows in one set-based
  -- INSERT ... SELECT, not p_meter_count x p_days x 24 individual inserts.
  insert into meter_readings (meter_id, reading_ts, delta_import_kwh, interval_seconds, source, quality)
  select
    ('99000000-0003-0000-0000-' || lpad(m::text, 12, '0'))::uuid,
    now() - (h || ' hours')::interval,
    round((1 + random() * 3)::numeric, 3),
    3600, 'meter', 'good'
  from generate_series(1, p_meter_count) as m
  cross join generate_series(0, p_days * 24 - 1) as h;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

comment on function seed_scale_readings(int, int) is
  'Manual scale seed for #58/#57 query-timing work. Not called by any migration. Usage: tools/loadtest/README.md.';
