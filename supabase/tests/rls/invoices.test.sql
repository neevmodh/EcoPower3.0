-- invoices / invoice_lines RLS (#21): owner-only visibility, same shape as
-- consumer.test.sql for service_connections. No DISCOM policy exists on
-- either table — deliberate, per #5's "DISCOM sees your kWh, never your
-- card" principle — so a discom_officer with a matching division claim
-- still gets zero rows.

begin;
select plan(8);

-- 0005 pre-creates only the current + next month partition; these
-- fixtures use fixed August 2026 dates, so ensure that partition exists
-- regardless of when the suite runs (idempotent, rolled back with the txn).
select create_monthly_partition(date '2026-08-01');

insert into orgs (id, name, type) values ('d0000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('d0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('d0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('d0000000-0000-0000-0000-0000000000a3', 'd0000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-0000000000e1', 'invoice.x@test.local'),
  ('d0000000-0000-0000-0000-0000000000e2', 'invoice.y@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('d0000000-0000-0000-0000-0000000000c1', 'CN-X-INV', 'd0000000-0000-0000-0000-0000000000a3', 'd0000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('d0000000-0000-0000-0000-0000000000c2', 'CN-Y-INV', 'd0000000-0000-0000-0000-0000000000a3', 'd0000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid');

insert into meters (id, serial, service_connection_id) values
  ('d0000000-0000-0000-0000-0000000000f1', 'MTR-X-INV', 'd0000000-0000-0000-0000-0000000000c1');

insert into meter_readings (id, meter_id, reading_ts, kwh_import) values
  ('d0000000-0000-0000-0000-0000000000d1', 'd0000000-0000-0000-0000-0000000000f1', '2026-08-01 00:00:00+00', 10000.000),
  ('d0000000-0000-0000-0000-0000000000d2', 'd0000000-0000-0000-0000-0000000000f1', '2026-08-15 00:00:00+00', 10342.400);

insert into tariffs (id, category, area, name, fixed_charge_basis, electricity_duty_pct, appc_rate_paise_per_kwh, banking_charge_demand_paise_per_kwh, banking_charge_non_demand_paise_per_kwh, effective_from, source_document_url) values
  ('d0000000-0000-0000-0000-0000000000fa', 'RGP', 'urban', 'Test RGP tariff', 'per_connection', 10.0, 385, 150, 110, '2026-04-01', 'https://example.test/tariff');

insert into invoices (
  id, service_connection_id, tariff_id, billing_period_start, billing_period_end,
  opening_reading_id, opening_reading_ts, opening_kwh_import, opening_kwh_export,
  closing_reading_id, closing_reading_ts, closing_kwh_import, closing_kwh_export,
  units_imported_milli_kwh, units_exported_milli_kwh, units_net_milli_kwh,
  engine_version, total_paise, computed_hash
) values (
  'd0000000-0000-0000-0000-0000000000ba', 'd0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000fa',
  '2026-08-01', '2026-08-15',
  'd0000000-0000-0000-0000-0000000000d1', '2026-08-01 00:00:00+00', 10000.000, 0,
  'd0000000-0000-0000-0000-0000000000d2', '2026-08-15 00:00:00+00', 10342.400, 0,
  342400, 0, 342400,
  '1.0.0', 146450, 'deadbeef'
);

insert into invoice_lines (invoice_id, line_order, line_type, label, amount_paise) values
  ('d0000000-0000-0000-0000-0000000000ba', 1, 'energy_slab', 'Energy 0-50 @ 3.20', 16000);

-- ============================================================
-- Scope keys: invoices inherits dt_id/division_id/org_id from its
-- service_connection, same mechanism as service_connections itself.
-- ============================================================

select results_eq(
  $$ select division_id from invoices where id = 'd0000000-0000-0000-0000-0000000000ba' $$,
  $$ values ('d0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'an invoice keyed only by service_connection_id gets the correct division_id from the scope-key trigger'
);

-- ============================================================
-- Consumer ownership.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from invoices where id = 'd0000000-0000-0000-0000-0000000000ba' $$,
  'consumer X sees their own invoice'
);

select isnt_empty(
  $$ select 1 from invoice_lines where invoice_id = 'd0000000-0000-0000-0000-0000000000ba' $$,
  'consumer X sees their own invoice''s lines'
);

select results_eq(
  $$ select total_paise from invoices where id = 'd0000000-0000-0000-0000-0000000000ba' $$,
  $$ values (146450::bigint) $$,
  'the worked RGP example totals ₹1,464.50, matching #19/#20''s real tariff'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select is_empty(
  $$ select 1 from invoices where id = 'd0000000-0000-0000-0000-0000000000ba' $$,
  'consumer Y does not see consumer X''s invoice'
);

select is_empty(
  $$ select 1 from invoice_lines where invoice_id = 'd0000000-0000-0000-0000-0000000000ba' $$,
  'consumer Y does not see consumer X''s invoice lines (via the joined RLS check)'
);

-- ============================================================
-- No DISCOM policy: an officer of the matching division still sees nothing.
-- ============================================================

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["d0000000-0000-0000-0000-000000000001"],"division_ids":["d0000000-0000-0000-0000-00000000000a"]}}';

select is_empty(
  $$ select 1 from invoices $$,
  'a discom_officer of the matching division still sees zero invoices — no billing-visibility policy exists for DISCOM'
);

reset request.jwt.claims;
set local role anon;

select is_empty(
  $$ select 1 from invoices $$,
  'anon (no session) sees zero invoices'
);

select * from finish();
rollback;
