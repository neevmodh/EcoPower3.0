-- 0053_create_monthly_partition_search_path.sql — same bug class as 0052,
-- caught by the same CI run, one step further into the call chain:
-- backfill_unseeded_meter_readings() (0050, search_path = '') calls
-- create_monthly_partition(d::date) unqualified — fails to even look up
-- the function under an empty search_path, exactly like 0052's
-- resolve_scope_from_dt. And create_monthly_partition()'s own body has the
-- same problem one level deeper: its dynamic `execute format(...)` DDL
-- references the bare (unqualified) identifiers `meter_readings` and the
-- partition table name, which also need to resolve against *some*
-- search_path at execution time.
--
-- No `set search_path` added here either, for the same reason 0052's
-- comment documents — but it wouldn't matter for this function regardless:
-- DDL (ALTER TABLE, CREATE INDEX) isn't subject to RLS at all, so there's
-- no is_platform_admin()-style cascade risk to avoid. Qualification alone,
-- consistent with the rest of this fix.

create or replace function create_monthly_partition(p_month date) returns void as $$
declare
  v_start date := date_trunc('month', p_month);
  v_end date := v_start + interval '1 month';
  v_partition_name text := 'meter_readings_' || to_char(v_start, 'YYYY_MM');
begin
  execute format(
    'create table if not exists public.%I partition of public.meter_readings for values from (%L) to (%L)',
    v_partition_name, v_start, v_end
  );

  -- The trap: without these two lines, a new month's readings would be
  -- silently unprotected even though the parent has RLS enabled.
  execute format('alter table public.%I enable row level security', v_partition_name);
  execute format('alter table public.%I force row level security', v_partition_name);

  execute format(
    'create index if not exists %I on public.%I (service_connection_id, reading_ts desc)',
    v_partition_name || '_sc_idx', v_partition_name
  );
  execute format(
    'create index if not exists %I on public.%I (dt_id, reading_ts)',
    v_partition_name || '_dt_idx', v_partition_name
  );
  execute format(
    'create index if not exists %I on public.%I (division_id, reading_ts)',
    v_partition_name || '_div_idx', v_partition_name
  );
end;
$$ language plpgsql;

-- backfill_unseeded_meter_readings() (0050) calls this unqualified.
create or replace function backfill_unseeded_meter_readings(p_days int default 45)
  returns integer
  language plpgsql
as $$
declare
  v_rows   integer := 0;
  m        record;
  h        record;
  ts       timestamptz;
  cum_i    numeric;
  cum_e    numeric;
  hour_l   numeric;
  solar_kw numeric;
  load_kw  numeric;
  d_i      numeric;
  d_e      numeric;
  seas     numeric;
begin
  -- Partitions for the window (current month back p_days).
  perform public.create_monthly_partition(d::date)
  from generate_series(
    date_trunc('month', now() - make_interval(days => p_days)),
    date_trunc('month', now()),
    interval '1 month'
  ) as d;

  -- ---- consumer meters ----
  for m in
    select mtr.id as meter_id,
           coalesce(sc.sanctioned_load_kw, 4)::numeric as load_kw,
           coalesce((
             select a.capacity_kw from public.assets a
             where a.service_connection_id = sc.id and a.asset_type = 'pv_array' and a.capacity_kw is not null
             limit 1
           ), 3)::numeric as pv_kw
    from public.meters mtr
    join public.service_connections sc on sc.id = mtr.service_connection_id
    where not exists (select 1 from public.meter_readings r where r.meter_id = mtr.id)
  loop
    cum_i := 8000 + random() * 5000;
    cum_e := 400 + random() * 800;
    load_kw := m.load_kw * 0.2;
    ts := date_trunc('hour', now()) - make_interval(days => p_days);

    while ts < now() loop
      hour_l := extract(hour from ts) + extract(minute from ts) / 60.0;
      seas := 0.85 + 0.15 * sin(extract(doy from ts) / 58.0);          -- mild seasonal swing

      solar_kw := greatest(0,
        m.pv_kw * exp(-power((hour_l - 12.5) / 3.1, 2)) * (0.55 + 0.45 * random()) * seas);

      load_kw := m.load_kw * (
        0.16
        + 0.45 * exp(-power((hour_l - 8)  / 1.6, 2))
        + 0.70 * exp(-power((hour_l - 20) / 2.3, 2))
        + 0.14 * random());

      d_e := round(greatest(0, solar_kw - load_kw)::numeric, 3);
      d_i := round(greatest(0, load_kw - solar_kw)::numeric, 3);
      cum_i := cum_i + d_i;
      cum_e := cum_e + d_e;

      insert into public.meter_readings
        (meter_id, reading_ts, kwh_import, kwh_export, delta_import_kwh, delta_export_kwh,
         interval_seconds, active_power_kw, source, quality)
      values
        (m.meter_id, ts, round(cum_i, 3), round(cum_e, 3), d_i, d_e,
         3600, round(load_kw, 3), 'meter', 'good');

      v_rows := v_rows + 1;
      ts := ts + interval '1 hour';
    end loop;

    insert into public.meter_live_state
      (meter_id, last_reading_ts, kwh_import, kwh_export, active_power_kw, quality)
    values
      (m.meter_id, date_trunc('hour', now()), round(cum_i, 3), round(cum_e, 3), round(load_kw, 3), 'good')
    on conflict (meter_id) do update set
      last_reading_ts = excluded.last_reading_ts,
      kwh_import = excluded.kwh_import,
      kwh_export = excluded.kwh_export,
      active_power_kw = excluded.active_power_kw,
      updated_at = now();
  end loop;

  -- ---- DT-head meters: hourly delivered = sum of their DT's consumer
  --      imports x (1 + loss factor), so the loss ranking has real numbers.
  for m in
    select mtr.id as meter_id, mtr.dt_id,
           0.07 + (('x' || substr(md5(mtr.id::text), 1, 4))::bit(16)::int / 65535.0) * 0.16 as loss
    from public.meters mtr
    where mtr.dt_id is not null
      and not exists (select 1 from public.meter_readings r where r.meter_id = mtr.id)
  loop
    cum_i := 0;
    for h in
      select mr.reading_ts as ts, sum(mr.delta_import_kwh) as imp
      from public.meter_readings mr
      join public.meters cm on cm.id = mr.meter_id
      join public.service_connections sc on sc.id = cm.service_connection_id
      where sc.dt_id = m.dt_id and mr.delta_import_kwh is not null
      group by mr.reading_ts
      order by mr.reading_ts
    loop
      d_i := round((coalesce(h.imp, 0) * (1 + m.loss))::numeric, 3);
      cum_i := cum_i + d_i;
      insert into public.meter_readings
        (meter_id, reading_ts, kwh_import, delta_import_kwh, interval_seconds, source, quality)
      values
        (m.meter_id, h.ts, round(cum_i, 3), d_i, 3600, 'meter', 'good');
      v_rows := v_rows + 1;
    end loop;
    insert into public.meter_live_state (meter_id, last_reading_ts, kwh_import, quality)
    values (m.meter_id, date_trunc('hour', now()), round(cum_i, 3), 'good')
    on conflict (meter_id) do update set
      last_reading_ts = excluded.last_reading_ts, kwh_import = excluded.kwh_import, updated_at = now();
  end loop;

  raise notice 'backfill_unseeded_meter_readings: inserted % rows', v_rows;
  return v_rows;
end;
$$;
