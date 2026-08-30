-- 0006_ingest_support.sql
-- Support tables for #15's ingest worker: quarantine for readings that fail
-- the clock-skew check, and an event log for detected register rollovers.
-- Neither is a silent drop — both are queryable, and quarantine count
-- surfaces in the operator panel.

create table quarantine_readings (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references meters (id),
  reading_ts timestamptz not null,
  raw_payload jsonb not null,
  reason text not null,
  received_at timestamptz not null default now(),
  service_connection_id uuid,
  dt_id uuid,
  division_id uuid,
  org_id uuid
);

create trigger quarantine_readings_scope_keys
  before insert on quarantine_readings
  for each row execute function set_scope_keys_from_meter();

create index quarantine_readings_meter_id_idx on quarantine_readings (meter_id, received_at desc);

alter table quarantine_readings enable row level security;
alter table quarantine_readings force row level security;

create policy quarantine_readings_discom_scope on quarantine_readings
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create table meter_rollover_events (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references meters (id),
  obis text not null,
  previous_value numeric not null,
  new_value numeric not null,
  detected_at timestamptz not null default now(),
  service_connection_id uuid,
  dt_id uuid,
  division_id uuid,
  org_id uuid
);

create trigger meter_rollover_events_scope_keys
  before insert on meter_rollover_events
  for each row execute function set_scope_keys_from_meter();

create index meter_rollover_events_meter_id_idx on meter_rollover_events (meter_id, detected_at desc);

alter table meter_rollover_events enable row level security;
alter table meter_rollover_events force row level security;

create policy meter_rollover_events_discom_scope on meter_rollover_events
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );
