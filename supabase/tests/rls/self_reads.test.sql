-- self-reads (0026): consumer submits own only, other consumers can't see
-- it, a reviewer accepts it and a meter_readings row appears.

begin;
select plan(7);

select create_monthly_partition(date_trunc('month', now())::date);

insert into orgs (id, name, type) values ('c6000000-0000-0000-0000-000000000001', 'SR DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('c6000000-0000-0000-0000-00000000000a', 'c6000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('c6000000-0000-0000-0000-0000000000a1', 'c6000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('c6000000-0000-0000-0000-0000000000a2', 'c6000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('c6000000-0000-0000-0000-0000000000a3', 'c6000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('c6000000-0000-0000-0000-0000000000e1', 'sr.owner@test.local'),
  ('c6000000-0000-0000-0000-0000000000e2', 'sr.other@test.local'),
  ('c6000000-0000-0000-0000-0000000000e3', 'sr.support@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('c6000000-0000-0000-0000-0000000000c1', 'CN-SR-1', 'c6000000-0000-0000-0000-0000000000a3', 'c6000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('c6000000-0000-0000-0000-0000000000c2', 'CN-SR-2', 'c6000000-0000-0000-0000-0000000000a3', 'c6000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('c6000000-0000-0000-0000-0000000000d1', 'MTR-SR-1', 'c6000000-0000-0000-0000-0000000000c1');

-- ---- consumer submits own ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"c6000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select lives_ok(
  $$insert into self_read_submissions (id, service_connection_id, meter_id, submitted_by, reading_kwh, ocr_raw, min_digit_confidence)
    values ('c6000000-0000-0000-0000-0000000000f1','c6000000-0000-0000-0000-0000000000c1','c6000000-0000-0000-0000-0000000000d1','c6000000-0000-0000-0000-0000000000e1', 42571, '42571', 0.71)$$,
  'consumer can submit a self-read for their own connection'
);

select is(
  (select division_id from self_read_submissions where id = 'c6000000-0000-0000-0000-0000000000f1'),
  'c6000000-0000-0000-0000-00000000000a'::uuid,
  'the scope-key trigger fills division_id from the meter'
);

select throws_ok(
  $$insert into self_read_submissions (service_connection_id, meter_id, submitted_by, reading_kwh)
    values ('c6000000-0000-0000-0000-0000000000c2','c6000000-0000-0000-0000-0000000000d1','c6000000-0000-0000-0000-0000000000e1', 100)$$,
  '42501',
  NULL,
  'consumer cannot submit a self-read for someone else''s connection'
);

-- ---- another consumer cannot see it ----
set local request.jwt.claims = '{"sub":"c6000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is(
  (select count(*)::int from self_read_submissions where id = 'c6000000-0000-0000-0000-0000000000f1'),
  0,
  'another consumer cannot see the submission'
);

-- ---- support agent sees and accepts it ----
set local request.jwt.claims = '{"sub":"c6000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"roles":["support_agent"],"org_ids":[],"division_ids":[]}}';
select is(
  (select count(*)::int from self_read_submissions where id = 'c6000000-0000-0000-0000-0000000000f1'),
  1,
  'a support agent sees the pending submission'
);

select lives_ok(
  $$select accept_self_read('c6000000-0000-0000-0000-0000000000f1', 'plausible')$$,
  'a support agent can accept the submission'
);

select is(
  (select count(*)::int from meter_readings
     where meter_id = 'c6000000-0000-0000-0000-0000000000d1' and source = 'ocr' and kwh_import = 42571),
  1,
  'accepting the submission writes an ocr-sourced meter_readings row'
);

rollback;
