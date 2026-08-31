-- field_technician RLS. Direct consumer data (service_connections, meters)
-- stays default-deny — a field technician's job is the equipment, not the
-- billing/consumption record behind it, same "DISCOM sees your kWh, never
-- your card" line #5/#21 already draw for other roles. What #89 actually
-- adds is work_orders (0019): a technician sees and can act on their own
-- RESCO org's work orders, not another org's.

begin;
select plan(6);

insert into orgs (id, name, type) values
  ('70000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom'),
  ('70000000-0000-0000-0000-000000000002', 'Test RESCO', 'resco'),
  ('70000000-0000-0000-0000-000000000003', 'Other RESCO', 'resco');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('70000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('70000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('70000000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('70000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-0000000000a2', 'DT A');
insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('70000000-0000-0000-0000-0000000000c1', 'CN-A-001', '70000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid');

insert into auth.users (id, email) values ('70000000-0000-0000-0000-0000000000e1', 'wo.tech@test.local');

insert into work_orders (id, resco_org_id, service_connection_id, title, description, assigned_user_id) values
  ('70000000-0000-0000-0000-0000000000d1', '70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-0000000000c1', 'Inspect inverter', 'Consumer reported a fault code.', '70000000-0000-0000-0000-0000000000e1'),
  ('70000000-0000-0000-0000-0000000000d2', '70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-0000000000c1', 'Other RESCO order', 'Not this technician''s org.', null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["field_technician"],"org_ids":["70000000-0000-0000-0000-000000000002"],"division_ids":["70000000-0000-0000-0000-00000000000a"]}}';

select is_empty(
  $$ select 1 from service_connections $$,
  'field_technician sees zero service connections — direct consumer data stays default-deny'
);

select is_empty(
  $$ select 1 from meters $$,
  'field_technician sees zero meters (same principle)'
);

select isnt_empty(
  $$ select 1 from work_orders where id = '70000000-0000-0000-0000-0000000000d1' $$,
  'field_technician sees a work order assigned to them in their own RESCO org'
);

select is_empty(
  $$ select 1 from work_orders where id = '70000000-0000-0000-0000-0000000000d2' $$,
  'field_technician does not see another RESCO org''s work order'
);

update work_orders set status = 'in_progress' where id = '70000000-0000-0000-0000-0000000000d1';
select isnt_empty(
  $$ select 1 from work_orders where id = '70000000-0000-0000-0000-0000000000d1' and status = 'in_progress' $$,
  'field_technician can update the status of their own assigned work order'
);

update work_orders set status = 'cancelled' where id = '70000000-0000-0000-0000-0000000000d2';

reset role;
select results_eq(
  $$ select status::text from work_orders where id = '70000000-0000-0000-0000-0000000000d2' $$,
  $$ values ('open'::text) $$,
  'field_technician''s update to another RESCO org''s work order matched zero rows under RLS — verified with RLS bypassed'
);

select * from finish();
rollback;
