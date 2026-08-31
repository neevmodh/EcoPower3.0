-- netmetering_applications RLS (#89 / issue #28) — a consumer submits
-- against their own service_connection, a discom_officer sees and decides
-- only within their own division, same shape as every other
-- division-scoped DISCOM read (0004). Also verifies the approval trigger
-- writes a real notification back to the consumer, not just a status flip.

begin;
select plan(7);

insert into orgs (id, name, type) values ('60000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('60000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('60000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values
  ('60000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-00000000000a', 'SS A'),
  ('60000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-00000000000b', 'SS B');
insert into feeders (id, substation_id, name) values
  ('60000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', 'Feeder A'),
  ('60000000-0000-0000-0000-0000000000b2', '60000000-0000-0000-0000-0000000000b1', 'Feeder B');
insert into distribution_transformers (id, feeder_id, name) values
  ('60000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-0000000000a2', 'DT A'),
  ('60000000-0000-0000-0000-0000000000b3', '60000000-0000-0000-0000-0000000000b2', 'DT B');

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-0000000000f1', 'nm.a@test.local'),
  ('60000000-0000-0000-0000-0000000000f2', 'nm.b@test.local'),
  ('60000000-0000-0000-0000-0000000000f3', 'nm.officer@test.local');

insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type, owner_user_id) values
  ('60000000-0000-0000-0000-0000000000c1', 'CN-A-001', '60000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid', '60000000-0000-0000-0000-0000000000f1'),
  ('60000000-0000-0000-0000-0000000000c2', 'CN-B-001', '60000000-0000-0000-0000-0000000000b3', 'RGP', 'single', 'postpaid', '60000000-0000-0000-0000-0000000000f2');

-- Consumer submits their own application.
set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('60000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000000c1', 5);

select isnt_empty(
  $$ select 1 from netmetering_applications where id = '60000000-0000-0000-0000-0000000000d1' $$,
  'consumer sees their own submitted application'
);

reset role;
insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('60000000-0000-0000-0000-0000000000d2', '60000000-0000-0000-0000-0000000000c2', 3);

-- Division A officer: sees only Division A's application.
set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-0000000000f3","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["60000000-0000-0000-0000-000000000001"],"division_ids":["60000000-0000-0000-0000-00000000000a"]}}';

select isnt_empty(
  $$ select 1 from netmetering_applications where id = '60000000-0000-0000-0000-0000000000d1' $$,
  'discom_officer sees the application in their own division'
);

select is_empty(
  $$ select 1 from netmetering_applications where id = '60000000-0000-0000-0000-0000000000d2' $$,
  'discom_officer does not see another division''s application'
);

update netmetering_applications
set status = 'approved', decision_notes = 'Meets capacity limits.'
where id = '60000000-0000-0000-0000-0000000000d1';

select results_eq(
  $$ select status::text from netmetering_applications where id = '60000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('approved'::text) $$,
  'discom_officer can approve an application in their own division'
);

update netmetering_applications set status = 'rejected' where id = '60000000-0000-0000-0000-0000000000d2';
reset role;
select results_eq(
  $$ select status::text from netmetering_applications where id = '60000000-0000-0000-0000-0000000000d2' $$,
  $$ values ('submitted'::text) $$,
  'discom_officer''s attempted decision on another division''s application matched zero rows under RLS'
);

-- The approval trigger (0019) should have written a real notification to
-- the owning consumer — not just flipped the status column.
select isnt_empty(
  $$ select 1 from notifications where user_id = '60000000-0000-0000-0000-0000000000f1' and type = 'netmetering_update' $$,
  'approving the application writes a real notification back to the consumer'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is_empty(
  $$ select 1 from netmetering_applications where id = '60000000-0000-0000-0000-0000000000d1' $$,
  'a different consumer does not see the first consumer''s application'
);

select * from finish();
rollback;
