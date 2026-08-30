-- support_tickets / ticket_replies / notifications RLS (#86/#87). Unlike
-- billing, support IS visible to staff — a support_agent sees every
-- ticket, because a queue with no queue view isn't a support system.
-- Notifications are strictly owner-only, and only ever written by a
-- security definer trigger, never a user's own session.

begin;
select plan(11);

insert into orgs (id, name, type) values ('a1000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('a1000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('a1000000-0000-0000-0000-0000000000a2', 'a1000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('a1000000-0000-0000-0000-0000000000a3', 'a1000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-0000000000e1', 'tix.x@test.local'),
  ('a1000000-0000-0000-0000-0000000000e2', 'tix.y@test.local'),
  ('a1000000-0000-0000-0000-0000000000e4', 'tix.agent@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('a1000000-0000-0000-0000-0000000000c1', 'CN-X-TIX', 'a1000000-0000-0000-0000-0000000000a3', 'a1000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('a1000000-0000-0000-0000-0000000000c2', 'CN-Y-TIX', 'a1000000-0000-0000-0000-0000000000a3', 'a1000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid');

insert into user_roles (user_id, role) values ('a1000000-0000-0000-0000-0000000000e4', 'support_agent');

insert into support_tickets (id, service_connection_id, subject, description) values
  ('a1000000-0000-0000-0000-0000000000d1', 'a1000000-0000-0000-0000-0000000000c1', 'Meter offline', 'No readings since yesterday');

select results_eq(
  $$ select division_id from support_tickets where id = 'a1000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('a1000000-0000-0000-0000-00000000000a'::uuid) $$,
  'a support_ticket keyed only by service_connection_id gets the correct division_id'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from support_tickets where id = 'a1000000-0000-0000-0000-0000000000d1' $$,
  'consumer X sees their own ticket'
);

insert into ticket_replies (ticket_id, author_user_id, body) values
  ('a1000000-0000-0000-0000-0000000000d1', 'a1000000-0000-0000-0000-0000000000e1', 'Any update?');

select isnt_empty(
  $$ select 1 from ticket_replies where ticket_id = 'a1000000-0000-0000-0000-0000000000d1' $$,
  'consumer X sees their own reply on their own ticket'
);

set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select is_empty(
  $$ select 1 from support_tickets where id = 'a1000000-0000-0000-0000-0000000000d1' $$,
  'consumer Y does not see consumer X''s ticket'
);

select is_empty(
  $$ select 1 from ticket_replies where ticket_id = 'a1000000-0000-0000-0000-0000000000d1' $$,
  'consumer Y does not see consumer X''s ticket replies'
);

set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-0000000000e4","role":"authenticated","app_metadata":{"roles":["support_agent"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from support_tickets where id = 'a1000000-0000-0000-0000-0000000000d1' $$,
  'a support_agent sees every ticket, unlike a DISCOM officer with billing'
);

update support_tickets set status = 'in_progress' where id = 'a1000000-0000-0000-0000-0000000000d1';

select results_eq(
  $$ select status::text from support_tickets where id = 'a1000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('in_progress') $$,
  'a support_agent can update ticket status'
);

insert into ticket_replies (ticket_id, author_user_id, body) values
  ('a1000000-0000-0000-0000-0000000000d1', 'a1000000-0000-0000-0000-0000000000e4', 'Looking into it now.');

-- Superuser check: proves the trigger fired and wrote the row at all,
-- independent of whose RLS-scoped session can see it (that's the next
-- two assertions' job).
reset request.jwt.claims;
reset role;

select isnt_empty(
  $$ select 1 from notifications where user_id = 'a1000000-0000-0000-0000-0000000000e1' and type = 'ticket_reply' $$,
  'the agent''s reply triggers a real notification for the ticket''s owning consumer'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from notifications where user_id = 'a1000000-0000-0000-0000-0000000000e1' $$,
  'consumer X sees their own notification'
);

select throws_ok(
  $$ insert into notifications (user_id, type, title, body) values ('a1000000-0000-0000-0000-0000000000e1', 'ticket_reply', 'fake', 'fake') $$,
  '42501',
  null,
  'a consumer cannot fabricate their own notification directly — only the security definer trigger can write here'
);

set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select is_empty(
  $$ select 1 from notifications where user_id = 'a1000000-0000-0000-0000-0000000000e1' $$,
  'consumer Y cannot see consumer X''s notifications'
);

select * from finish();
rollback;
