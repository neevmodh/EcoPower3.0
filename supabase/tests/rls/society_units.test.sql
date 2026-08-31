-- society_admin/society_member RLS via my_society_unit_ids() (0020) — the
-- Society panel used to have nothing real to scope: society_admin/member
-- have existed as roles since 0001 with zero grants. This asserts the
-- real shape: admin sees every unit in their society, member sees only
-- their own, per-unit billing (invoices) stays out of reach for both.

begin;
select plan(9);

insert into orgs (id, name, type) values
  ('90000000-0000-0000-0000-000000000001', 'Test Society', 'society'),
  ('90000000-0000-0000-0000-000000000002', 'Other Society', 'society'),
  ('90000000-0000-0000-0000-000000000003', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('90000000-0000-0000-0000-00000000000a', '90000000-0000-0000-0000-000000000003', 'Division A', 'division');
insert into substations (id, division_id, name) values ('90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('90000000-0000-0000-0000-0000000000a2', '90000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('90000000-0000-0000-0000-0000000000a3', '90000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-0000000000e1', 'unit.owner@test.local');

insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type, society_org_id, allocation_pct, owner_user_id) values
  ('90000000-0000-0000-0000-0000000000c1', 'SOC-A-001', '90000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid', '90000000-0000-0000-0000-000000000001', 50, '90000000-0000-0000-0000-0000000000e1'),
  ('90000000-0000-0000-0000-0000000000c2', 'SOC-A-002', '90000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid', '90000000-0000-0000-0000-000000000001', 50, null),
  ('90000000-0000-0000-0000-0000000000c3', 'SOC-B-001', '90000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid', '90000000-0000-0000-0000-000000000002', 100, null);

insert into meters (id, serial, service_connection_id) values
  ('90000000-0000-0000-0000-0000000000f1', 'MTR-SOC-A-001', '90000000-0000-0000-0000-0000000000c1');

-- society_admin, org A: sees both A units, not B's.
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"roles":["society_admin"],"org_ids":["90000000-0000-0000-0000-000000000001"],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from service_connections where id = '90000000-0000-0000-0000-0000000000c1' $$,
  'society_admin sees a unit in their own society'
);
select isnt_empty(
  $$ select 1 from service_connections where id = '90000000-0000-0000-0000-0000000000c2' $$,
  'society_admin sees every unit in their society, not just the owned one'
);
select is_empty(
  $$ select 1 from service_connections where id = '90000000-0000-0000-0000-0000000000c3' $$,
  'society_admin does not see another society''s unit'
);
select isnt_empty(
  $$ select 1 from meters where id = '90000000-0000-0000-0000-0000000000f1' $$,
  'society_admin sees the meter behind a unit in their society'
);

update service_connections set allocation_pct = 40 where id = '90000000-0000-0000-0000-0000000000c1';
select results_eq(
  $$ select allocation_pct from service_connections where id = '90000000-0000-0000-0000-0000000000c1' $$,
  $$ values (40::numeric) $$,
  'society_admin can edit allocation_pct for a unit in their society'
);

select is_empty(
  $$ select 1 from invoices where service_connection_id = '90000000-0000-0000-0000-0000000000c1' $$,
  'society_admin still sees zero invoices — per-unit billing stays owner-only'
);

-- society_member with no ownership claim on any unit: sees nothing.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-0000000000d2","role":"authenticated","app_metadata":{"roles":["society_member"],"org_ids":[],"division_ids":[]}}';
select is_empty(
  $$ select 1 from service_connections $$,
  'society_member with no owned unit sees nothing — membership alone grants no visibility'
);

-- society_member who owns c1: sees only their own unit, not c2's (same org).
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["society_member"],"org_ids":[],"division_ids":[]}}';
select isnt_empty(
  $$ select 1 from service_connections where id = '90000000-0000-0000-0000-0000000000c1' $$,
  'society_member sees their own unit via ownership'
);
select is_empty(
  $$ select 1 from service_connections where id = '90000000-0000-0000-0000-0000000000c2' $$,
  'society_member does not see another unit in the same society they don''t own'
);

select * from finish();
rollback;
