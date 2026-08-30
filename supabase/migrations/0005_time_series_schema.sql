-- 0005_time_series_schema.sql
-- meter_readings: the partitioned time-series table #3's scope-key trigger
-- was built for. meter_live_state: one row per meter, low cardinality,
-- cheap RLS, safe for Realtime Postgres Changes (#18).

-- ============================================================
-- meter_readings
-- ============================================================

create table meter_readings (
  meter_id uuid not null references meters (id),
  reading_ts timestamptz not null,

  -- Cumulative OBIS registers. Real meters send these; deltas are computed
  -- at ingest (#15), never at read time. Storing both lets a rollover be
  -- detected and lets any invoice line point at the two reads that bracket it.
  kwh_import numeric,
  kwh_export numeric,
  kvah_import numeric,
  kvarh_lag numeric,
  kvarh_lead numeric,

  -- Instantaneous.
  voltage_r numeric,
  voltage_y numeric,
  voltage_b numeric,
  current_r numeric,
  current_y numeric,
  current_b numeric,
  power_factor numeric,
  frequency_hz numeric,
  active_power_kw numeric,
  apparent_power_kva numeric,

  -- Derived at ingest, never at read time.
  delta_import_kwh numeric,
  delta_export_kwh numeric,
  interval_seconds integer,

  -- VEE provenance.
  source text not null default 'meter' check (source in ('meter', 'estimated', 'manual', 'ocr')),
  quality text not null default 'good' check (quality in ('good', 'estimated', 'suspect', 'missing')),
  tamper_flags integer not null default 0, -- IS 15959 event code bitmask

  -- Denormalized scope keys (#3), populated by set_scope_keys_from_meter().
  service_connection_id uuid,
  dt_id uuid,
  division_id uuid,
  org_id uuid,

  primary key (meter_id, reading_ts)
) partition by range (reading_ts);

create trigger meter_readings_scope_keys
  before insert on meter_readings
  for each row execute function set_scope_keys_from_meter();

-- RLS on the parent applies to every query that goes through the parent
-- (the normal case — PostgREST/app code never names a monthly partition
-- directly). Policies defined here are inherited by partitions automatically.
-- ENABLE/FORCE ROW LEVEL SECURITY is NOT inherited, though — that's the trap
-- create_monthly_partition() exists to close for every future partition.
alter table meter_readings enable row level security;
alter table meter_readings force row level security;

create policy meter_readings_discom_scope on meter_readings
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create policy meter_readings_consumer_scope on meter_readings
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- ============================================================
-- create_monthly_partition() — the partition trap, closed.
-- Called by pg_cron a month ahead (scheduling itself is #17's job; this
-- migration calls it directly for the current and next month so the table
-- is usable immediately).
-- ============================================================

create function create_monthly_partition(p_month date) returns void as $$
declare
  v_start date := date_trunc('month', p_month);
  v_end date := v_start + interval '1 month';
  v_partition_name text := 'meter_readings_' || to_char(v_start, 'YYYY_MM');
begin
  execute format(
    'create table if not exists %I partition of meter_readings for values from (%L) to (%L)',
    v_partition_name, v_start, v_end
  );

  -- The trap: without these two lines, a new month's readings would be
  -- silently unprotected even though the parent has RLS enabled.
  execute format('alter table %I enable row level security', v_partition_name);
  execute format('alter table %I force row level security', v_partition_name);

  execute format(
    'create index if not exists %I on %I (service_connection_id, reading_ts desc)',
    v_partition_name || '_sc_idx', v_partition_name
  );
  execute format(
    'create index if not exists %I on %I (dt_id, reading_ts)',
    v_partition_name || '_dt_idx', v_partition_name
  );
  execute format(
    'create index if not exists %I on %I (division_id, reading_ts)',
    v_partition_name || '_div_idx', v_partition_name
  );
end;
$$ language plpgsql;

select create_monthly_partition(date_trunc('month', now())::date);
select create_monthly_partition((date_trunc('month', now()) + interval '1 month')::date);

-- ============================================================
-- meter_live_state — one row per meter, UPSERTed by the ingest worker (#15).
-- ============================================================

create table meter_live_state (
  meter_id uuid primary key references meters (id),
  last_reading_ts timestamptz,
  kwh_import numeric,
  kwh_export numeric,
  active_power_kw numeric,
  voltage_r numeric,
  voltage_y numeric,
  voltage_b numeric,
  quality text,
  tamper_flags integer,
  service_connection_id uuid,
  dt_id uuid,
  division_id uuid,
  org_id uuid,
  updated_at timestamptz not null default now()
);

create trigger meter_live_state_scope_keys
  before insert or update on meter_live_state
  for each row execute function set_scope_keys_from_meter();

create trigger meter_live_state_set_updated_at
  before update on meter_live_state
  for each row execute function set_updated_at();

alter table meter_live_state enable row level security;
alter table meter_live_state force row level security;

create policy meter_live_state_discom_scope on meter_live_state
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create policy meter_live_state_consumer_scope on meter_live_state
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- Low cardinality (one row per meter) — safe for Realtime Postgres Changes.
alter publication supabase_realtime add table meter_live_state;
