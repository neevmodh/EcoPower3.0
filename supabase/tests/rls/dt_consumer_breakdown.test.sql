-- dt_consumer_breakdown(p_dt_id) — the loss-map drill-down (0022, #27).
-- Verifies: the ranking is real (tamper flags float a consumer to the
-- top), a clean consumer scores zero, and — because the function is
-- security invoker — an officer of another division gets nothing back
-- even when they pass a valid DT id.

begin;
select plan(6);

select create_monthly_partition(date_trunc('month', now())::date);

insert into orgs (id, name, type) values ('c0000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('c0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values ('c0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('c0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000a2', 'DT A');

insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type, sanctioned_load_kw) values
  ('c0000000-0000-0000-0000-0000000000c1', 'CN-CLEAN', 'c0000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid', 4),
  ('c0000000-0000-0000-0000-0000000000c2', 'CN-TAMPER', 'c0000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid', 4);

insert into meters (id, serial, service_connection_id) values
  ('c0000000-0000-0000-0000-0000000000d1', 'MTR-CLEAN', 'c0000000-0000-0000-0000-0000000000c1'),
  ('c0000000-0000-0000-0000-0000000000d2', 'MTR-TAMPER', 'c0000000-0000-0000-0000-0000000000c2');

-- Clean consumer: healthy consumption, no tamper flags.
insert into meter_readings (meter_id, reading_ts, delta_import_kwh, tamper_flags) values
  ('c0000000-0000-0000-0000-0000000000d1', now() - interval '2 hours', 20, 0),
  ('c0000000-0000-0000-0000-0000000000d1', now() - interval '1 hour', 20, 0);
-- Tampered consumer: lower recorded consumption AND tamper flags set.
insert into meter_readings (meter_id, reading_ts, delta_import_kwh, tamper_flags) values
  ('c0000000-0000-0000-0000-0000000000d2', now() - interval '2 hours', 5, 8),
  ('c0000000-0000-0000-0000-0000000000d2', now() - interval '1 hour', 5, 8);

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["c0000000-0000-0000-0000-000000000001"],"division_ids":["c0000000-0000-0000-0000-00000000000a"]}}';

select is(
  (select consumer_number from dt_consumer_breakdown('c0000000-0000-0000-0000-0000000000a3') limit 1),
  'CN-TAMPER',
  'the tampered consumer ranks first'
);

select ok(
  (select suspicion_score from dt_consumer_breakdown('c0000000-0000-0000-0000-0000000000a3') where consumer_number = 'CN-TAMPER') >= 40,
  'tamper flags contribute at least 40 to the suspicion score'
);

select ok(
  (select 'tamper flags on 2 reading(s)' = any(suspicion_reasons) from dt_consumer_breakdown('c0000000-0000-0000-0000-0000000000a3') where consumer_number = 'CN-TAMPER'),
  'the tamper reason names the count of flagged readings'
);

select is(
  (select suspicion_score from dt_consumer_breakdown('c0000000-0000-0000-0000-0000000000a3') where consumer_number = 'CN-CLEAN'),
  0,
  'the clean consumer scores zero'
);

select is(
  (select count(*)::int from dt_consumer_breakdown('c0000000-0000-0000-0000-0000000000a3')),
  2,
  'both consumers on the DT are listed'
);

-- Officer of Division B: the function is security invoker, so RLS on
-- meters / service_connections / meter_readings gives them nothing.
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["c0000000-0000-0000-0000-000000000001"],"division_ids":["c0000000-0000-0000-0000-00000000000b"]}}';

select is_empty(
  $$ select 1 from dt_consumer_breakdown('c0000000-0000-0000-0000-0000000000a3') $$,
  'an officer of another division gets an empty breakdown for DT A'
);

select finish();
rollback;
