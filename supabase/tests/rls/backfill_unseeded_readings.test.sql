-- backfill_unseeded_meter_readings() (0050) — locks in the behavior
-- extracted out of seed_demo_readings() (0037) before #105's sandbox
-- provisioning starts depending on it directly. No pgTAP coverage existed
-- for this logic before now; it only ever ran implicitly at migration-apply
-- time.

begin;
select plan(5);

insert into orgs (id, name, type) values ('98000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('98000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('98000000-0000-0000-0000-0000000000a1', '98000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('98000000-0000-0000-0000-0000000000a2', '98000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('98000000-0000-0000-0000-0000000000a3', '98000000-0000-0000-0000-0000000000a2', 'DT A');
insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type, sanctioned_load_kw) values
  ('98000000-0000-0000-0000-0000000000c1', 'CN-A-BACKFILL', '98000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid', 5);

-- A consumer meter and a DT-head meter, both brand new (zero readings).
insert into meters (id, serial, service_connection_id) values
  ('98000000-0000-0000-0000-0000000000f1', 'MTR-CONSUMER-BF', '98000000-0000-0000-0000-0000000000c1');
insert into meters (id, serial, dt_id) values
  ('98000000-0000-0000-0000-0000000000f2', 'MTR-DTHEAD-BF', '98000000-0000-0000-0000-0000000000a3');

select ok(
  backfill_unseeded_meter_readings(2) > 0,
  'backfilling 2 days of history for two brand-new meters inserts rows'
);

select isnt_empty(
  $$ select 1 from meter_readings where meter_id = '98000000-0000-0000-0000-0000000000f1' $$,
  'the consumer meter got real reading rows'
);

select isnt_empty(
  $$ select 1 from meter_live_state where meter_id = '98000000-0000-0000-0000-0000000000f2' $$,
  'the DT-head meter got a live-state row too'
);

select ok(
  (select delta_import_kwh from meter_readings where meter_id = '98000000-0000-0000-0000-0000000000f2' order by reading_ts desc limit 1) >= 0,
  'the DT-head meter''s delivered energy is a real non-negative number, not a placeholder'
);

-- Idempotence: a meter that already has readings is left alone (the
-- `not exists` scope this function relies on for reuse by #105's
-- per-tenant provisioning) — calling it again inserts nothing further.
select is(
  backfill_unseeded_meter_readings(2),
  0,
  'calling it again for the same already-backfilled meters is a no-op'
);

select * from finish();
rollback;
