-- resco_admin/resco_ops RLS (#18 closes the gap #5 documented and this
-- file used to assert directly: assets had no RESCO-ownership column, so
-- resco_ops/resco_admin were correctly default-denied everything. Now
-- that assets.resco_org_id exists, a RESCO operator sees their own org's
-- assets — and only their own org's, same isolation shape as every other
-- org/division-scoped role in this schema.

begin;
select plan(6);

insert into orgs (id, name, type) values
  ('80000000-0000-0000-0000-000000000001', 'Test RESCO', 'resco'),
  ('80000000-0000-0000-0000-000000000003', 'Other RESCO', 'resco'),
  ('80000000-0000-0000-0000-000000000002', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('80000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'Division A', 'division');
insert into substations (id, division_id, name) values ('80000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('80000000-0000-0000-0000-0000000000a2', '80000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('80000000-0000-0000-0000-0000000000a3', '80000000-0000-0000-0000-0000000000a2', 'DT A');
insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('80000000-0000-0000-0000-0000000000c1', 'CN-A-001', '80000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid'),
  ('80000000-0000-0000-0000-0000000000c2', 'CN-A-002', '80000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid');

insert into assets (id, service_connection_id, asset_type, capacity_kw, resco_org_id) values
  ('80000000-0000-0000-0000-0000000000d1', '80000000-0000-0000-0000-0000000000c1', 'pv_array', 5, '80000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-0000000000d2', '80000000-0000-0000-0000-0000000000c2', 'pv_array', 3, '80000000-0000-0000-0000-000000000003');

insert into meters (id, serial, service_connection_id) values
  ('80000000-0000-0000-0000-0000000000e1', 'MTR-A-001', '80000000-0000-0000-0000-0000000000c1'),
  ('80000000-0000-0000-0000-0000000000e2', 'MTR-A-002', '80000000-0000-0000-0000-0000000000c2');

set local role authenticated;
set local request.jwt.claims = '{"sub":"80000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["resco_ops"],"org_ids":["80000000-0000-0000-0000-000000000001"],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from assets where id = '80000000-0000-0000-0000-0000000000d1' $$,
  'resco_ops sees their own org''s asset — the gap #18 closed'
);

select is_empty(
  $$ select 1 from assets where id = '80000000-0000-0000-0000-0000000000d2' $$,
  'resco_ops does not see another RESCO''s asset'
);

select isnt_empty(
  $$ select 1 from meters where id = '80000000-0000-0000-0000-0000000000e1' $$,
  'resco_ops sees the meter behind their own asset''s service_connection'
);

select is_empty(
  $$ select 1 from meters where id = '80000000-0000-0000-0000-0000000000e2' $$,
  'resco_ops does not see the meter behind another RESCO''s asset'
);

select is_empty(
  $$ select 1 from service_connections $$,
  'resco_ops still sees zero service connections (not a DISCOM role, no consumer ownership) — unaffected by #18'
);

set local request.jwt.claims = '{"sub":"80000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"roles":["resco_admin"],"org_ids":["80000000-0000-0000-0000-000000000001"],"division_ids":[]}}';
select isnt_empty(
  $$ select 1 from assets where id = '80000000-0000-0000-0000-0000000000d1' $$,
  'resco_admin sees their own org''s asset too'
);

select * from finish();
rollback;
