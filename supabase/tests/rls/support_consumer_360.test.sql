-- support consumer 360 (0030): the curated lookup is support-agent only and
-- returns a bounded bundle, not blanket billing access.

begin;
select plan(4);

insert into orgs (id, name, type) values ('30000000-0000-0000-0000-000000000002', 'D Co', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', 'A', 'division');
insert into substations (id, division_id, name) values ('30000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-00000000000a', 'SS');
insert into feeders (id, substation_id, name) values ('30000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a1', 'F');
insert into distribution_transformers (id, feeder_id, name) values ('30000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a2', 'DT');
insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-0000000000e1', 'sup@test.local'),
  ('30000000-0000-0000-0000-0000000000e2', 'con@test.local');
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('30000000-0000-0000-0000-0000000000c1', 'CN-360', '30000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('30000000-0000-0000-0000-0000000000d1', 'MTR-360', '30000000-0000-0000-0000-0000000000c1');

set local role authenticated;

-- support agent: found bundle
set local request.jwt.claims = '{"sub":"30000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["support_agent"],"org_ids":[],"division_ids":[]}}';
select is(
  (support_consumer_360('CN-360') ->> 'found')::boolean, true,
  'support agent gets a found bundle for a real consumer number'
);
select is(
  support_consumer_360('CN-360') -> 'meter' ->> 'serial', 'MTR-360',
  'the bundle carries the meter serial'
);
select is(
  (support_consumer_360('NOPE') ->> 'found')::boolean, false,
  'an unknown consumer number returns found:false, not an error'
);

-- a consumer cannot call it
set local request.jwt.claims = '{"sub":"30000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select throws_ok(
  $$select support_consumer_360('CN-360')$$,
  '42501',
  NULL,
  'a non-support role cannot call the lookup'
);

rollback;
