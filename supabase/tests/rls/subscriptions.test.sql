-- subscriptions / subscription_events RLS (#77/#78): owner-only, same
-- shape as invoices.test.sql. plans/plan_services are published catalog
-- data, authenticated-readable like tariffs (#20). The partial unique
-- index enforces at most one active/paused subscription per connection —
-- the trimmed stand-in for #25's EXCLUDE constraint.

begin;
select plan(9);

insert into orgs (id, name, type) values ('f0000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('f0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('f0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('f0000000-0000-0000-0000-0000000000a3', 'f0000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-0000000000e1', 'sub.x@test.local'),
  ('f0000000-0000-0000-0000-0000000000e2', 'sub.y@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('f0000000-0000-0000-0000-0000000000c1', 'CN-X-SUB', 'f0000000-0000-0000-0000-0000000000a3', 'f0000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('f0000000-0000-0000-0000-0000000000c2', 'CN-Y-SUB', 'f0000000-0000-0000-0000-0000000000a3', 'f0000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid');

-- Catalog: any authenticated user can read it, even one with no roles/connections.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from plans where code = 'solar_basic' $$,
  'any authenticated user can read the plan catalog'
);

select isnt_empty(
  $$ select 1 from plan_services $$,
  'any authenticated user can read plan_services'
);

reset request.jwt.claims;
reset role;

insert into subscriptions (id, service_connection_id, plan_id) values
  ('f0000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000c1', (select id from plans where code = 'solar_basic'));

insert into subscription_events (subscription_id, event_type, to_plan_id) values
  ('f0000000-0000-0000-0000-0000000000b1', 'created', (select id from plans where code = 'solar_basic'));

select results_eq(
  $$ select division_id from subscriptions where id = 'f0000000-0000-0000-0000-0000000000b1' $$,
  $$ values ('f0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'a subscription keyed only by service_connection_id gets the correct division_id'
);

select throws_ok(
  $$ insert into subscriptions (service_connection_id, plan_id) values ('f0000000-0000-0000-0000-0000000000c1', (select id from plans where code = 'solar_backup')) $$,
  '23505',
  null,
  'a second active subscription on the same connection violates the one-active-subscription-per-connection index'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from subscriptions where id = 'f0000000-0000-0000-0000-0000000000b1' $$,
  'consumer X sees their own subscription'
);

select isnt_empty(
  $$ select 1 from subscription_events where subscription_id = 'f0000000-0000-0000-0000-0000000000b1' $$,
  'consumer X sees their own subscription''s events'
);

set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select is_empty(
  $$ select 1 from subscriptions where id = 'f0000000-0000-0000-0000-0000000000b1' $$,
  'consumer Y does not see consumer X''s subscription'
);

select is_empty(
  $$ select 1 from subscription_events where subscription_id = 'f0000000-0000-0000-0000-0000000000b1' $$,
  'consumer Y does not see consumer X''s subscription events (via the joined RLS check)'
);

set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["f0000000-0000-0000-0000-000000000001"],"division_ids":["f0000000-0000-0000-0000-00000000000a"]}}';

select is_empty(
  $$ select 1 from subscriptions $$,
  'a discom_officer of the matching division still sees zero subscriptions — no billing-visibility policy exists for DISCOM'
);

select * from finish();
rollback;
