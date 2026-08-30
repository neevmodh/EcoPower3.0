-- discom_officer RLS: the concrete claim from #5/BUILD-ORDER's Sprint 1
-- checkpoint, formalized. "Officer of Division A sees zero rows from
-- Division B" is not a manual demo step anymore — it runs in CI on every
-- push against a fresh `supabase db reset`.

begin;
select plan(9);

-- Topology: two divisions, each with its own DT and service connection.
insert into orgs (id, name, type) values ('d0000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('d0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('d0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000001', 'Division B', 'division');

-- Circle -> Division -> Subdivision chain, for the transitive-closure check.
insert into discom_divisions (id, discom_org_id, name, level) values
  ('d0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-000000000001', 'Circle C', 'circle');
insert into discom_divisions (id, discom_org_id, parent_division_id, name, level) values
  ('d0000000-0000-0000-0000-0000000000c2', 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000c1', 'Division under C', 'division');

insert into substations (id, division_id, name) values
  ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-00000000000a', 'SS A'),
  ('d0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-00000000000b', 'SS B');
insert into feeders (id, substation_id, name) values
  ('d0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000a1', 'Feeder A'),
  ('d0000000-0000-0000-0000-0000000000b2', 'd0000000-0000-0000-0000-0000000000b1', 'Feeder B');
insert into distribution_transformers (id, feeder_id, name) values
  ('d0000000-0000-0000-0000-0000000000a3', 'd0000000-0000-0000-0000-0000000000a2', 'DT A'),
  ('d0000000-0000-0000-0000-0000000000b3', 'd0000000-0000-0000-0000-0000000000b2', 'DT B');

insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('d0000000-0000-0000-0000-0000000000a4', 'CN-A-001', 'd0000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid'),
  ('d0000000-0000-0000-0000-0000000000b4', 'CN-B-001', 'd0000000-0000-0000-0000-0000000000b3', 'RGP', 'single', 'postpaid');

insert into meters (id, serial, service_connection_id) values
  ('d0000000-0000-0000-0000-0000000000a5', 'MTR-A-001', 'd0000000-0000-0000-0000-0000000000a4'),
  ('d0000000-0000-0000-0000-0000000000b5', 'MTR-B-001', 'd0000000-0000-0000-0000-0000000000b4');

-- Officer of Division A only.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["d0000000-0000-0000-0000-000000000001"],"division_ids":["d0000000-0000-0000-0000-00000000000a"]}}';

select isnt_empty(
  $$ select 1 from service_connections where id = 'd0000000-0000-0000-0000-0000000000a4' $$,
  'officer of Division A sees Division A''s own connection'
);

select is_empty(
  $$ select 1 from service_connections where division_id = 'd0000000-0000-0000-0000-00000000000b' $$,
  'officer of Division A sees zero rows from Division B'
);

select isnt_empty(
  $$ select 1 from meters where id = 'd0000000-0000-0000-0000-0000000000a5' $$,
  'officer of Division A sees Division A''s own meter'
);

select is_empty(
  $$ select 1 from meters where division_id = 'd0000000-0000-0000-0000-00000000000b' $$,
  'officer of Division A sees zero meters from Division B'
);

select isnt_empty(
  $$ select 1 from distribution_transformers where id = 'd0000000-0000-0000-0000-0000000000a3' $$,
  'officer of Division A sees Division A''s own DT'
);

select is_empty(
  $$ select 1 from distribution_transformers where id = 'd0000000-0000-0000-0000-0000000000b3' $$,
  'officer of Division A sees zero DTs from Division B'
);

-- Circle head: transitive closure of the division subtree (#4's recursive
-- CTE, already verified live at login; this checks the RLS side reads the
-- pre-expanded claim correctly).
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["d0000000-0000-0000-0000-000000000001"],"division_ids":["d0000000-0000-0000-0000-0000000000c1","d0000000-0000-0000-0000-0000000000c2"]}}';

select isnt_empty(
  $$ select 1 from discom_divisions where id = 'd0000000-0000-0000-0000-0000000000c2' $$,
  'Circle head sees the subdivision beneath them via the pre-expanded claim'
);

-- No role at all: default deny.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated","app_metadata":{"roles":[],"org_ids":[],"division_ids":[]}}';

select is_empty(
  $$ select 1 from service_connections $$,
  'a user with no roles sees zero service connections (default deny)'
);

-- No session at all: the anon role, no JWT claims.
reset request.jwt.claims;
set local role anon;
select is_empty(
  $$ select 1 from service_connections $$,
  'anon (no session) sees zero service connections'
);

select * from finish();
rollback;
