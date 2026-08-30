-- resco_admin/resco_ops RLS. #5 noted this gap explicitly: assets carries
-- no RESCO-ownership column (0001/0002 never added one), so there is
-- nothing to scope a RESCO operator's visibility on yet. Default deny is
-- therefore the only correct behavior right now — this asserts it directly
-- so the gap is enforced, not just documented in a comment someone can miss.

begin;
select plan(3);

insert into orgs (id, name, type) values ('80000000-0000-0000-0000-000000000001', 'Test RESCO', 'resco');
insert into orgs (id, name, type) values ('80000000-0000-0000-0000-000000000002', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('80000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'Division A', 'division');
insert into substations (id, division_id, name) values ('80000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('80000000-0000-0000-0000-0000000000a2', '80000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('80000000-0000-0000-0000-0000000000a3', '80000000-0000-0000-0000-0000000000a2', 'DT A');
insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('80000000-0000-0000-0000-0000000000c1', 'CN-A-001', '80000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid');
insert into assets (service_connection_id, asset_type, capacity_kw) values
  ('80000000-0000-0000-0000-0000000000c1', 'pv_array', 5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"80000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["resco_ops"],"org_ids":["80000000-0000-0000-0000-000000000001"],"division_ids":[]}}';

select is_empty(
  $$ select 1 from assets $$,
  'resco_ops sees zero assets (default deny — no RESCO-ownership column exists yet, see #5)'
);

select is_empty(
  $$ select 1 from service_connections $$,
  'resco_ops sees zero service connections (not a DISCOM role, no consumer ownership)'
);

set local request.jwt.claims = '{"sub":"80000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["resco_admin"],"org_ids":["80000000-0000-0000-0000-000000000001"],"division_ids":[]}}';
select is_empty(
  $$ select 1 from assets $$,
  'resco_admin sees zero assets (same gap)'
);

select * from finish();
rollback;
