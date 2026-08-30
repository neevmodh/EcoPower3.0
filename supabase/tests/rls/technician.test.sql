-- field_technician RLS. #5's spec is time-and-status-bounded access via
-- work_orders ("only while an assigned work order is open on it") — that
-- table doesn't exist yet (lands with the DISCOM panel, #26/#27). Until
-- then the only correct behavior is default deny, and that is exactly what
-- this asserts: a technician with a real, granted role still sees zero
-- service connections. When #26/#27 adds the work_orders-scoped policy,
-- this test's assertion flips from "sees nothing" to "sees only what's
-- assigned" — the failure is the forcing function to update it.

begin;
select plan(2);

insert into orgs (id, name, type) values ('70000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('70000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('70000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('70000000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('70000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-0000000000a2', 'DT A');
insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('70000000-0000-0000-0000-0000000000c1', 'CN-A-001', '70000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid');

set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["field_technician"],"org_ids":["70000000-0000-0000-0000-000000000001"],"division_ids":["70000000-0000-0000-0000-00000000000a"]}}';

select is_empty(
  $$ select 1 from service_connections $$,
  'field_technician sees zero service connections (default deny — work_orders-scoped access lands with #26/#27)'
);

select is_empty(
  $$ select 1 from meters $$,
  'field_technician sees zero meters (same gap)'
);

select * from finish();
rollback;
