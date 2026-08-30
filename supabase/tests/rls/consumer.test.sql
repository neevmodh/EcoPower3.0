-- consumer RLS: owner-only visibility on service_connections and, through
-- them, assets. A consumer must never see another consumer's connection or
-- equipment, and must never see anything with no session at all.

begin;
select plan(7);

insert into orgs (id, name, type) values ('c0000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('c0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('c0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000a2', 'DT A');

-- Two real auth.users rows — service_connections.owner_user_id has an FK to
-- auth.users, so ownership tests need a real row, not just a claimed sub.
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-0000000000e1', 'consumer.x@test.local'),
  ('c0000000-0000-0000-0000-0000000000e2', 'consumer.y@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('c0000000-0000-0000-0000-0000000000c1', 'CN-X-001', 'c0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('c0000000-0000-0000-0000-0000000000c2', 'CN-Y-001', 'c0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid');

insert into assets (service_connection_id, asset_type, capacity_kw) values
  ('c0000000-0000-0000-0000-0000000000c1', 'pv_array', 5),
  ('c0000000-0000-0000-0000-0000000000c2', 'pv_array', 5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from service_connections where id = 'c0000000-0000-0000-0000-0000000000c1' $$,
  'consumer X sees their own connection'
);

select is_empty(
  $$ select 1 from service_connections where id = 'c0000000-0000-0000-0000-0000000000c2' $$,
  'consumer X does not see consumer Y''s connection'
);

select results_eq(
  $$ select consumer_number from service_connections order by consumer_number $$,
  $$ values ('CN-X-001') $$,
  'consumer X''s connection list contains exactly their own, nothing else'
);

select isnt_empty(
  $$ select 1 from assets where service_connection_id = 'c0000000-0000-0000-0000-0000000000c1' $$,
  'consumer X sees their own asset'
);

select is_empty(
  $$ select 1 from assets where service_connection_id = 'c0000000-0000-0000-0000-0000000000c2' $$,
  'consumer X does not see consumer Y''s asset'
);

-- A consumer role with no connection at all owns nothing and sees nothing.
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is_empty(
  $$ select 1 from service_connections $$,
  'a consumer with no linked connection sees zero rows'
);

reset request.jwt.claims;
set local role anon;
select is_empty(
  $$ select 1 from service_connections $$,
  'anon (no session) sees zero service connections'
);

select * from finish();
rollback;
