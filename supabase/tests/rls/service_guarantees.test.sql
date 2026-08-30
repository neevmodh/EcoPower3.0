-- service_guarantees / guarantee_settlements RLS (#76): owner-only
-- visibility, same shape as invoices.test.sql — a guarantee's contracted
-- terms and settlement credits are billing data, not grid-operations data,
-- so no DISCOM policy exists on either table.

begin;
select plan(7);

insert into orgs (id, name, type) values ('90000000-0000-0000-0000-a00000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('90000000-0000-0000-0000-a0000000000a', '90000000-0000-0000-0000-a00000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('90000000-0000-0000-0000-a000000000a1', '90000000-0000-0000-0000-a0000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('90000000-0000-0000-0000-a000000000a2', '90000000-0000-0000-0000-a000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('90000000-0000-0000-0000-a000000000a3', '90000000-0000-0000-0000-a000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-a000000000e1', 'guarantee.x@test.local'),
  ('90000000-0000-0000-0000-a000000000e2', 'guarantee.y@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('90000000-0000-0000-0000-a000000000c1', 'CN-X-GUAR', '90000000-0000-0000-0000-a000000000a3', '90000000-0000-0000-0000-a000000000e1', 'RGP', 'single', 'postpaid'),
  ('90000000-0000-0000-0000-a000000000c2', 'CN-Y-GUAR', '90000000-0000-0000-0000-a000000000a3', '90000000-0000-0000-0000-a000000000e2', 'RGP', 'single', 'postpaid');

insert into service_guarantees (id, service_connection_id, metric, contracted_value, measurement_window, rate_paise_per_unit_shortfall, cap_paise, effective_from) values
  ('90000000-0000-0000-0000-a000000000f1', '90000000-0000-0000-0000-a000000000c1', 'cuf', 0.15, 'monthly', 100000, 50000, '2026-04-01');

insert into guarantee_settlements (service_guarantee_id, window_start, window_end, contracted, achieved, shortfall, credit_paise) values
  ('90000000-0000-0000-0000-a000000000f1', '2026-08-01', '2026-09-01', 0.15, 0.12, 0.03, 3000);

-- ============================================================
-- Scope keys: same trigger mechanism as service_connections/invoices.
-- ============================================================

select results_eq(
  $$ select division_id from service_guarantees where id = '90000000-0000-0000-0000-a000000000f1' $$,
  $$ values ('90000000-0000-0000-0000-a0000000000a'::uuid) $$,
  'a service_guarantee keyed only by service_connection_id gets the correct division_id'
);

-- ============================================================
-- Consumer ownership.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-a000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from service_guarantees where id = '90000000-0000-0000-0000-a000000000f1' $$,
  'consumer X sees their own guarantee'
);

select isnt_empty(
  $$ select 1 from guarantee_settlements where service_guarantee_id = '90000000-0000-0000-0000-a000000000f1' $$,
  'consumer X sees their own guarantee''s settlements'
);

select results_eq(
  $$ select credit_paise from guarantee_settlements where service_guarantee_id = '90000000-0000-0000-0000-a000000000f1' $$,
  $$ values (3000::bigint) $$,
  'the shortfall settlement carries the credit computed by guarantee-engine.ts (0.03 shortfall @ Rs 1000/point = Rs 30)'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-a000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select is_empty(
  $$ select 1 from service_guarantees where id = '90000000-0000-0000-0000-a000000000f1' $$,
  'consumer Y does not see consumer X''s guarantee'
);

select is_empty(
  $$ select 1 from guarantee_settlements where service_guarantee_id = '90000000-0000-0000-0000-a000000000f1' $$,
  'consumer Y does not see consumer X''s settlements (via the joined RLS check)'
);

-- ============================================================
-- No DISCOM policy: an officer of the matching division still sees nothing.
-- ============================================================

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-a000000000e3","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["90000000-0000-0000-0000-a00000000001"],"division_ids":["90000000-0000-0000-0000-a0000000000a"]}}';

select is_empty(
  $$ select 1 from service_guarantees $$,
  'a discom_officer of the matching division still sees zero guarantees — no billing-visibility policy exists for DISCOM'
);

select * from finish();
rollback;
