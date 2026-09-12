-- quarantine_readings RLS (0006) — no dedicated test existed for this
-- table before now, despite it being the "never silently dropped" record
-- the ingest worker (#15) writes to on clock skew. Division-scoped to
-- discom_officer/discom_admin, same shape as every other DISCOM table.

begin;
select plan(3);

insert into orgs (id, name, type) values ('95000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('95000000-0000-0000-0000-00000000000a', '95000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('95000000-0000-0000-0000-00000000000b', '95000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values
  ('95000000-0000-0000-0000-0000000000a1', '95000000-0000-0000-0000-00000000000a', 'SS A'),
  ('95000000-0000-0000-0000-0000000000b1', '95000000-0000-0000-0000-00000000000b', 'SS B');
insert into feeders (id, substation_id, name) values
  ('95000000-0000-0000-0000-0000000000a2', '95000000-0000-0000-0000-0000000000a1', 'Feeder A'),
  ('95000000-0000-0000-0000-0000000000b2', '95000000-0000-0000-0000-0000000000b1', 'Feeder B');
insert into distribution_transformers (id, feeder_id, name) values
  ('95000000-0000-0000-0000-0000000000a3', '95000000-0000-0000-0000-0000000000a2', 'DT A'),
  ('95000000-0000-0000-0000-0000000000b3', '95000000-0000-0000-0000-0000000000b2', 'DT B');
insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('95000000-0000-0000-0000-0000000000c1', 'CN-A-QRT', '95000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid'),
  ('95000000-0000-0000-0000-0000000000c2', 'CN-B-QRT', '95000000-0000-0000-0000-0000000000b3', 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('95000000-0000-0000-0000-0000000000d1', 'MTR-A-QRT', '95000000-0000-0000-0000-0000000000c1'),
  ('95000000-0000-0000-0000-0000000000d2', 'MTR-B-QRT', '95000000-0000-0000-0000-0000000000c2');

insert into quarantine_readings (meter_id, reading_ts, raw_payload, reason) values
  ('95000000-0000-0000-0000-0000000000d1', now() + interval '10 minutes', '{"kwh_import": 42}'::jsonb, 'reading_ts more than 5 minutes in the future'),
  ('95000000-0000-0000-0000-0000000000d2', now() + interval '10 minutes', '{"kwh_import": 7}'::jsonb, 'reading_ts more than 5 minutes in the future');

select results_eq(
  $$ select division_id from quarantine_readings where meter_id = '95000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('95000000-0000-0000-0000-00000000000a'::uuid) $$,
  'a quarantined reading keyed only by meter_id gets the correct division_id (0002''s scope-key trigger)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"95000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["95000000-0000-0000-0000-000000000001"],"division_ids":["95000000-0000-0000-0000-00000000000a"]}}';

select isnt_empty(
  $$ select 1 from quarantine_readings where meter_id = '95000000-0000-0000-0000-0000000000d1' $$,
  'a Division A officer sees Division A''s quarantined reading'
);

select is_empty(
  $$ select 1 from quarantine_readings where meter_id = '95000000-0000-0000-0000-0000000000d2' $$,
  'a Division A officer sees none of Division B''s quarantined readings'
);

select * from finish();
rollback;
