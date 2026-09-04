-- hourly_load_profile() (0025): the RPC is security invoker, so a consumer
-- calling it only ever profiles their own meter, and a DISCOM officer only
-- a meter inside their division — same boundary daily_energy_summary relies
-- on, proven here directly.

begin;
select plan(4);

-- service_connections.owner_user_id has an FK to auth.users, so an ownership
-- test needs a real row, not just a claimed sub.
insert into auth.users (id, email) values
  ('91000000-0000-0000-0000-0000000000e1', 'consumer.hlp@test.local');

insert into orgs (id, name, type) values ('91000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('91000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('91000000-0000-0000-0000-00000000000b', '91000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values
  ('91000000-0000-0000-0000-0000000000a1', '91000000-0000-0000-0000-00000000000a', 'SS A'),
  ('91000000-0000-0000-0000-0000000000b1', '91000000-0000-0000-0000-00000000000b', 'SS B');
insert into feeders (id, substation_id, name) values
  ('91000000-0000-0000-0000-0000000000a2', '91000000-0000-0000-0000-0000000000a1', 'Feeder A'),
  ('91000000-0000-0000-0000-0000000000b2', '91000000-0000-0000-0000-0000000000b1', 'Feeder B');
insert into distribution_transformers (id, feeder_id, name) values
  ('91000000-0000-0000-0000-0000000000a3', '91000000-0000-0000-0000-0000000000a2', 'DT A'),
  ('91000000-0000-0000-0000-0000000000b3', '91000000-0000-0000-0000-0000000000b2', 'DT B');
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('91000000-0000-0000-0000-0000000000a4', 'CN-A-001', '91000000-0000-0000-0000-0000000000a3', '91000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('91000000-0000-0000-0000-0000000000b4', 'CN-B-001', '91000000-0000-0000-0000-0000000000b3', null, 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('91000000-0000-0000-0000-0000000000a5', 'MTR-A-001', '91000000-0000-0000-0000-0000000000a4'),
  ('91000000-0000-0000-0000-0000000000b5', 'MTR-B-001', '91000000-0000-0000-0000-0000000000b4');

insert into meter_readings (meter_id, reading_ts, kwh_import, delta_import_kwh, delta_export_kwh, interval_seconds) values
  ('91000000-0000-0000-0000-0000000000a5', now() - interval '1 day',  10, 0.5, 0.0, 900),
  ('91000000-0000-0000-0000-0000000000a5', now() - interval '2 days', 11, 0.7, 0.1, 900),
  ('91000000-0000-0000-0000-0000000000b5', now() - interval '1 day',  20, 0.9, 0.0, 900);

-- ============================================================
-- Consumer: owns meter A, calling the RPC profiles only meter A.
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"]}}';

select isnt_empty(
  $$ select 1 from hourly_load_profile('91000000-0000-0000-0000-0000000000a5'::uuid, 30) $$,
  'consumer who owns meter A gets a profile back for meter A'
);

select is_empty(
  $$ select 1 from hourly_load_profile('91000000-0000-0000-0000-0000000000b5'::uuid, 30) $$,
  'the same consumer profiling meter B (not theirs) gets nothing — RLS on meter_readings still applies'
);

reset request.jwt.claims;
reset role;

-- ============================================================
-- DISCOM officer of Division A: meter A visible, meter B not.
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["91000000-0000-0000-0000-000000000001"],"division_ids":["91000000-0000-0000-0000-00000000000a"]}}';

select isnt_empty(
  $$ select 1 from hourly_load_profile('91000000-0000-0000-0000-0000000000a5'::uuid, 30) $$,
  'officer of Division A can profile a Division A meter'
);

select is_empty(
  $$ select 1 from hourly_load_profile('91000000-0000-0000-0000-0000000000b5'::uuid, 30) $$,
  'officer of Division A cannot profile a Division B meter'
);

reset request.jwt.claims;
reset role;

select * from finish();
rollback;
