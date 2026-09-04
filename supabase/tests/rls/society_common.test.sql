-- society common (0034): a society_admin writes common charges + notices
-- for their own org; a unit owner in the society reads; an outsider sees
-- nothing.

begin;
select plan(4);

insert into orgs (id, name, type) values
  ('34000000-0000-0000-0000-000000000001', 'Shanti Society', 'society'),
  ('34000000-0000-0000-0000-000000000009', 'Other Society', 'society'),
  ('34000000-0000-0000-0000-000000000002', 'D Co', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values ('34000000-0000-0000-0000-00000000000a', '34000000-0000-0000-0000-000000000002', 'A', 'division');
insert into substations (id, division_id, name) values ('34000000-0000-0000-0000-0000000000a1', '34000000-0000-0000-0000-00000000000a', 'SS');
insert into feeders (id, substation_id, name) values ('34000000-0000-0000-0000-0000000000a2', '34000000-0000-0000-0000-0000000000a1', 'F');
insert into distribution_transformers (id, feeder_id, name) values ('34000000-0000-0000-0000-0000000000a3', '34000000-0000-0000-0000-0000000000a2', 'DT');
insert into auth.users (id, email) values
  ('34000000-0000-0000-0000-0000000000e1', 'soc.admin@test.local'),
  ('34000000-0000-0000-0000-0000000000e2', 'soc.resident@test.local'),
  ('34000000-0000-0000-0000-0000000000e3', 'outsider@test.local');
insert into service_connections (id, consumer_number, dt_id, owner_user_id, society_org_id, allocation_pct, tariff_category, phase, connection_type) values
  ('34000000-0000-0000-0000-0000000000c1', 'SOC-A-1', '34000000-0000-0000-0000-0000000000a3', '34000000-0000-0000-0000-0000000000e2', '34000000-0000-0000-0000-000000000001', 25, 'RGP', 'single', 'postpaid');

set local role authenticated;

-- admin writes a charge for their own society
set local request.jwt.claims = '{"sub":"34000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["society_admin"],"org_ids":["34000000-0000-0000-0000-000000000001"],"division_ids":[]}}';
select lives_ok(
  $$insert into society_common_charges (society_org_id, period_start, period_end, category, label, amount_paise, split_basis)
    values ('34000000-0000-0000-0000-000000000001', current_date - 30, current_date, 'lighting', 'Corridor lights', 500000, 'equal')$$,
  'a society_admin can post a common charge for their own society'
);
select throws_ok(
  $$insert into society_notices (society_org_id, title, body) values ('34000000-0000-0000-0000-000000000009', 'x', 'y')$$,
  '42501',
  NULL,
  'a society_admin cannot post to a different society'
);

-- a unit owner in the society reads the charge
set local request.jwt.claims = '{"sub":"34000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is((select count(*)::int from society_common_charges), 1, 'a unit owner in the society reads the common charges');

-- an outsider sees nothing
set local request.jwt.claims = '{"sub":"34000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is((select count(*)::int from society_common_charges), 0, 'an unrelated consumer sees no common charges');

rollback;
