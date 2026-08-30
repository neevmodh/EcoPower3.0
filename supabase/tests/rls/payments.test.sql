-- payment_orders / payments RLS (#39): owner-only, same shape as
-- invoices.test.sql. No DISCOM policy — billing/payment data stays
-- consumer-owner-only, same principle as #21/#76.

begin;
select plan(8);

insert into orgs (id, name, type) values ('e0000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('e0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('e0000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-0000000000e1', 'payments.x@test.local'),
  ('e0000000-0000-0000-0000-0000000000e2', 'payments.y@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('e0000000-0000-0000-0000-0000000000c1', 'CN-X-PAY', 'e0000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('e0000000-0000-0000-0000-0000000000c2', 'CN-Y-PAY', 'e0000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid');

insert into meters (id, serial, service_connection_id) values
  ('e0000000-0000-0000-0000-0000000000f1', 'MTR-X-PAY', 'e0000000-0000-0000-0000-0000000000c1');

insert into meter_readings (id, meter_id, reading_ts, kwh_import) values
  ('e0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000f1', '2026-08-01 00:00:00+00', 10000.000),
  ('e0000000-0000-0000-0000-0000000000d2', 'e0000000-0000-0000-0000-0000000000f1', '2026-08-15 00:00:00+00', 10100.000);

insert into tariffs (id, category, area, name, fixed_charge_basis, electricity_duty_pct, appc_rate_paise_per_kwh, banking_charge_demand_paise_per_kwh, banking_charge_non_demand_paise_per_kwh, effective_from, source_document_url) values
  ('e0000000-0000-0000-0000-0000000000fa', 'RGP', 'urban', 'Test RGP tariff', 'per_connection', 10.0, 385, 150, 110, '2026-04-01', 'https://example.test/tariff');

insert into invoices (
  id, service_connection_id, tariff_id, billing_period_start, billing_period_end,
  opening_reading_id, opening_reading_ts, opening_kwh_import, opening_kwh_export,
  closing_reading_id, closing_reading_ts, closing_kwh_import, closing_kwh_export,
  units_imported_milli_kwh, units_exported_milli_kwh, units_net_milli_kwh,
  engine_version, total_paise, computed_hash
) values (
  'e0000000-0000-0000-0000-0000000000ba', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000fa',
  '2026-08-01', '2026-08-15',
  'e0000000-0000-0000-0000-0000000000d1', '2026-08-01 00:00:00+00', 10000.000, 0,
  'e0000000-0000-0000-0000-0000000000d2', '2026-08-15 00:00:00+00', 10100.000, 0,
  100000, 0, 100000,
  '1.0.0', 32000, 'deadbeef'
);

insert into payment_orders (id, invoice_id, service_connection_id, amount_paise, razorpay_order_id) values
  ('e0000000-0000-0000-0000-0000000000fb', 'e0000000-0000-0000-0000-0000000000ba', 'e0000000-0000-0000-0000-0000000000c1', 32000, 'order_test123');

insert into payments (payment_order_id, razorpay_payment_id, status, amount_paise) values
  ('e0000000-0000-0000-0000-0000000000fb', 'pay_test123', 'captured', 32000);

-- ============================================================
-- Scope keys.
-- ============================================================

select results_eq(
  $$ select division_id from payment_orders where id = 'e0000000-0000-0000-0000-0000000000fb' $$,
  $$ values ('e0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'a payment_order keyed only by service_connection_id gets the correct division_id'
);

-- ============================================================
-- Consumer ownership.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from payment_orders where id = 'e0000000-0000-0000-0000-0000000000fb' $$,
  'consumer X sees their own payment order'
);

select isnt_empty(
  $$ select 1 from payments where payment_order_id = 'e0000000-0000-0000-0000-0000000000fb' $$,
  'consumer X sees their own payment'
);

select lives_ok(
  $$ insert into payment_orders (invoice_id, service_connection_id, amount_paise) values ('e0000000-0000-0000-0000-0000000000ba', 'e0000000-0000-0000-0000-0000000000c1', 5000) $$,
  'consumer X can insert a new payment order against their own service_connection'
);

set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select is_empty(
  $$ select 1 from payment_orders where id = 'e0000000-0000-0000-0000-0000000000fb' $$,
  'consumer Y does not see consumer X''s payment order'
);

select is_empty(
  $$ select 1 from payments where payment_order_id = 'e0000000-0000-0000-0000-0000000000fb' $$,
  'consumer Y does not see consumer X''s payment (via the joined RLS check)'
);

select throws_ok(
  $$ insert into payment_orders (invoice_id, service_connection_id, amount_paise) values ('e0000000-0000-0000-0000-0000000000ba', 'e0000000-0000-0000-0000-0000000000c1', 5000) $$,
  '42501',
  null,
  'consumer Y cannot create a payment order against consumer X''s service_connection'
);

-- ============================================================
-- No DISCOM policy.
-- ============================================================

set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["e0000000-0000-0000-0000-000000000001"],"division_ids":["e0000000-0000-0000-0000-00000000000a"]}}';

select is_empty(
  $$ select 1 from payment_orders $$,
  'a discom_officer of the matching division still sees zero payment orders — no billing-visibility policy exists for DISCOM'
);

select * from finish();
rollback;
