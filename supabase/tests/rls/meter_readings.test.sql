-- meter_readings / meter_live_state RLS (#16), plus a direct demonstration
-- of the partition trap the issue warns about: RLS on a parent partitioned
-- table does NOT propagate to a child partition automatically. A raw
-- `CREATE TABLE ... PARTITION OF` ships with RLS off; only
-- create_monthly_partition() closes it.

begin;
select plan(7);

insert into orgs (id, name, type) values ('90000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('90000000-0000-0000-0000-00000000000a', '90000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('90000000-0000-0000-0000-00000000000b', '90000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values
  ('90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-00000000000a', 'SS A'),
  ('90000000-0000-0000-0000-0000000000b1', '90000000-0000-0000-0000-00000000000b', 'SS B');
insert into feeders (id, substation_id, name) values
  ('90000000-0000-0000-0000-0000000000a2', '90000000-0000-0000-0000-0000000000a1', 'Feeder A'),
  ('90000000-0000-0000-0000-0000000000b2', '90000000-0000-0000-0000-0000000000b1', 'Feeder B');
insert into distribution_transformers (id, feeder_id, name) values
  ('90000000-0000-0000-0000-0000000000a3', '90000000-0000-0000-0000-0000000000a2', 'DT A'),
  ('90000000-0000-0000-0000-0000000000b3', '90000000-0000-0000-0000-0000000000b2', 'DT B');
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('90000000-0000-0000-0000-0000000000a4', 'CN-A-001', '90000000-0000-0000-0000-0000000000a3', null, 'RGP', 'single', 'postpaid'),
  ('90000000-0000-0000-0000-0000000000b4', 'CN-B-001', '90000000-0000-0000-0000-0000000000b3', null, 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('90000000-0000-0000-0000-0000000000a5', 'MTR-A-001', '90000000-0000-0000-0000-0000000000a4'),
  ('90000000-0000-0000-0000-0000000000b5', 'MTR-B-001', '90000000-0000-0000-0000-0000000000b4');

insert into meter_readings (meter_id, reading_ts, kwh_import) values
  ('90000000-0000-0000-0000-0000000000a5', now(), 100.5),
  ('90000000-0000-0000-0000-0000000000b5', now(), 200.7);

-- ============================================================
-- The done-when #3 deferred: meter_id alone populates all four scope keys,
-- now proven against the real table.
-- ============================================================

select results_eq(
  $$ select division_id from meter_readings where meter_id = '90000000-0000-0000-0000-0000000000a5' limit 1 $$,
  $$ values ('90000000-0000-0000-0000-00000000000a'::uuid) $$,
  'a meter_readings row keyed only by meter_id gets the correct division_id from the scope-key trigger'
);

-- ============================================================
-- RLS on meter_readings: same Division A / B isolation as #5/#7.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["90000000-0000-0000-0000-000000000001"],"division_ids":["90000000-0000-0000-0000-00000000000a"]}}';

select isnt_empty(
  $$ select 1 from meter_readings where meter_id = '90000000-0000-0000-0000-0000000000a5' $$,
  'officer of Division A sees Division A''s reading'
);

select is_empty(
  $$ select 1 from meter_readings where division_id = '90000000-0000-0000-0000-00000000000b' $$,
  'officer of Division A sees zero readings from Division B'
);

reset request.jwt.claims;
reset role;

-- ============================================================
-- meter_live_state: upsert, scope keys, RLS.
-- ============================================================

insert into meter_live_state (meter_id, kwh_import, active_power_kw) values
  ('90000000-0000-0000-0000-0000000000a5', 100.5, 3.2)
on conflict (meter_id) do update set kwh_import = excluded.kwh_import;

select results_eq(
  $$ select division_id from meter_live_state where meter_id = '90000000-0000-0000-0000-0000000000a5' $$,
  $$ values ('90000000-0000-0000-0000-00000000000a'::uuid) $$,
  'meter_live_state scope keys populate the same way as meter_readings'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["90000000-0000-0000-0000-000000000001"],"division_ids":["90000000-0000-0000-0000-00000000000a"]}}';

select isnt_empty(
  $$ select 1 from meter_live_state where meter_id = '90000000-0000-0000-0000-0000000000a5' $$,
  'officer of Division A sees Division A''s live state'
);

reset request.jwt.claims;
reset role;

-- ============================================================
-- The partition trap, demonstrated directly: a raw partition (created the
-- way someone unaware of the trap would) ships with RLS OFF, even though
-- the parent has it on. Only create_monthly_partition() closes it.
-- ============================================================

create table meter_readings_2030_01 partition of meter_readings
  for values from ('2030-01-01') to ('2030-02-01');

select ok(
  (select relrowsecurity from pg_class where relname = 'meter_readings_2030_01') = false,
  'a raw partition (no helper) has RLS OFF — this is the trap the issue warns about'
);

select create_monthly_partition('2030-02-01'::date);

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'meter_readings_2030_02'),
  'create_monthly_partition() enables AND forces RLS on the new partition — the trap, closed'
);

-- cascade: #21's invoices/invoice_lines carry FKs to meter_readings(id,
-- reading_ts), and Postgres implements FK-to-partitioned-table via each
-- partition's own supporting index, so a plain DROP now fails even though
-- no row here is actually referenced. Safe — these are throwaway scratch
-- partitions the whole transaction rolls back anyway.
drop table meter_readings_2030_01 cascade;
drop table meter_readings_2030_02 cascade;

select * from finish();
rollback;
