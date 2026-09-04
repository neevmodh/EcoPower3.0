-- outages (0035): a DISCOM officer manages outages in their own division;
-- an officer in another division sees nothing; a consumer on the affected
-- DT can read the outage.

begin;
select plan(4);

insert into orgs (id, name, type) values ('35000000-0000-0000-0000-000000000001', 'D Co', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('35000000-0000-0000-0000-00000000000a', '35000000-0000-0000-0000-000000000001', 'A', 'division'),
  ('35000000-0000-0000-0000-00000000000b', '35000000-0000-0000-0000-000000000001', 'B', 'division');
insert into substations (id, division_id, name) values ('35000000-0000-0000-0000-0000000000a1', '35000000-0000-0000-0000-00000000000a', 'SS');
insert into feeders (id, substation_id, name) values ('35000000-0000-0000-0000-0000000000a2', '35000000-0000-0000-0000-0000000000a1', 'F');
insert into distribution_transformers (id, feeder_id, name) values ('35000000-0000-0000-0000-0000000000a3', '35000000-0000-0000-0000-0000000000a2', 'DT');
insert into auth.users (id, email) values
  ('35000000-0000-0000-0000-0000000000e1', 'off.a@test.local'),
  ('35000000-0000-0000-0000-0000000000e2', 'off.b@test.local'),
  ('35000000-0000-0000-0000-0000000000e3', 'consumer@test.local');
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('35000000-0000-0000-0000-0000000000c1', 'OUT-CN-1', '35000000-0000-0000-0000-0000000000a3', '35000000-0000-0000-0000-0000000000e3', 'RGP', 'single', 'postpaid');

set local role authenticated;

-- officer A logs an outage on DT A3
set local request.jwt.claims = '{"sub":"35000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":[],"division_ids":["35000000-0000-0000-0000-00000000000a"]}}';
select lives_ok(
  $$insert into outages (id, division_id, dt_id, outage_type, cause, consumers_affected)
    values ('35000000-0000-0000-0000-0000000000f1', '35000000-0000-0000-0000-00000000000a', '35000000-0000-0000-0000-0000000000a3', 'unplanned', 'breaker lockout', 40)$$,
  'a DISCOM officer can log an outage in their own division'
);
select throws_ok(
  $$insert into outages (division_id, outage_type) values ('35000000-0000-0000-0000-00000000000b', 'unplanned')$$,
  '42501',
  NULL,
  'an officer cannot log an outage in a division they do not hold'
);

-- officer B sees nothing
set local request.jwt.claims = '{"sub":"35000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":[],"division_ids":["35000000-0000-0000-0000-00000000000b"]}}';
select is((select count(*)::int from outages), 0, 'an officer in another division sees no outages here');

-- the affected consumer can read it
set local request.jwt.claims = '{"sub":"35000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is((select count(*)::int from outages where id = '35000000-0000-0000-0000-0000000000f1'), 1, 'a consumer on the affected DT can see the outage');

rollback;
