-- payment_orders_guard_update / payments_guard_insert (0043, #6) — the real
-- vulnerability: payment_orders_consumer_update only checked ownership, not
-- what changed, so a signed-in consumer could PATCH their own order
-- straight to status='paid' without ever paying. These assert the fix
-- holds for the exact attack, not just that "some" error is thrown.

begin;
select plan(11);

select create_monthly_partition(date '2026-08-01');

insert into orgs (id, name, type) values ('92000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('92000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('92000000-0000-0000-0000-0000000000a1', '92000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('92000000-0000-0000-0000-0000000000a2', '92000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('92000000-0000-0000-0000-0000000000a3', '92000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('92000000-0000-0000-0000-0000000000e1', 'guard.x@test.local'),
  ('92000000-0000-0000-0000-0000000000e2', 'guard.y@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('92000000-0000-0000-0000-0000000000c1', 'CN-X-GUARD', '92000000-0000-0000-0000-0000000000a3', '92000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('92000000-0000-0000-0000-0000000000c2', 'CN-Y-GUARD', '92000000-0000-0000-0000-0000000000a3', '92000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid');

insert into meters (id, serial, service_connection_id) values
  ('92000000-0000-0000-0000-0000000000f1', 'MTR-X-GUARD', '92000000-0000-0000-0000-0000000000c1');

insert into meter_readings (id, meter_id, reading_ts, kwh_import) values
  ('92000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-0000000000f1', '2026-08-01 00:00:00+00', 10000.000),
  ('92000000-0000-0000-0000-0000000000d2', '92000000-0000-0000-0000-0000000000f1', '2026-08-15 00:00:00+00', 10100.000);

insert into tariffs (id, category, area, name, fixed_charge_basis, electricity_duty_pct, appc_rate_paise_per_kwh, banking_charge_demand_paise_per_kwh, banking_charge_non_demand_paise_per_kwh, effective_from, source_document_url) values
  ('92000000-0000-0000-0000-0000000000fa', 'RGP', 'urban', 'Test RGP tariff', 'per_connection', 10.0, 385, 150, 110, '2026-04-01', 'https://example.test/tariff');

insert into invoices (
  id, service_connection_id, tariff_id, billing_period_start, billing_period_end,
  opening_reading_id, opening_reading_ts, opening_kwh_import, opening_kwh_export,
  closing_reading_id, closing_reading_ts, closing_kwh_import, closing_kwh_export,
  units_imported_milli_kwh, units_exported_milli_kwh, units_net_milli_kwh,
  engine_version, total_paise, computed_hash
) values (
  '92000000-0000-0000-0000-0000000000ba', '92000000-0000-0000-0000-0000000000c1', '92000000-0000-0000-0000-0000000000fa',
  '2026-08-01', '2026-08-15',
  '92000000-0000-0000-0000-0000000000d1', '2026-08-01 00:00:00+00', 10000.000, 0,
  '92000000-0000-0000-0000-0000000000d2', '2026-08-15 00:00:00+00', 10100.000, 0,
  100000, 0, 100000,
  '1.0.0', 32000, 'deadbeef'
);

insert into payment_orders (id, invoice_id, service_connection_id, amount_paise, razorpay_order_id, status) values
  ('92000000-0000-0000-0000-0000000000fb', '92000000-0000-0000-0000-0000000000ba', '92000000-0000-0000-0000-0000000000c1', 32000, 'order_guard123', 'created');

set local role authenticated;
set local request.jwt.claims = '{"sub":"92000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

-- The exact attack this migration closes.
select throws_ok(
  $$ update payment_orders set status = 'paid' where id = '92000000-0000-0000-0000-0000000000fb' $$,
  '42501',
  null,
  'a consumer cannot PATCH their own order straight to status=paid'
);

select throws_ok(
  $$ update payment_orders set amount_paise = 1 where id = '92000000-0000-0000-0000-0000000000fb' $$,
  '42501',
  null,
  'a consumer cannot change the amount on their own order'
);

-- The one legitimate transition still works.
select lives_ok(
  $$ update payment_orders set status = 'attempted' where id = '92000000-0000-0000-0000-0000000000fb' $$,
  'a consumer can still move their own order created -> attempted (what /api/payments/verify does)'
);

select ok(
  (select status from payment_orders where id = '92000000-0000-0000-0000-0000000000fb') = 'attempted',
  'the legitimate transition actually took effect'
);

-- No policy ever allowed a DELETE on either table — but per 0041/0046's
-- lesson, "no policy" alone isn't a guard against Supabase's baseline
-- grants. 0047 revokes DELETE explicitly; lock that in.
select throws_ok(
  $$ delete from payment_orders where id = '92000000-0000-0000-0000-0000000000fb' $$,
  '42501',
  null,
  'a consumer cannot delete their own payment order, erasing the payment trail'
);

select throws_ok(
  $$ delete from payments where payment_order_id = '92000000-0000-0000-0000-0000000000fb' $$,
  '42501',
  null,
  'a consumer cannot delete a payments row (none exist yet, but the grant itself must be gone)'
);

-- payments insert: status forgery.
select throws_ok(
  $$ insert into payments (payment_order_id, razorpay_payment_id, status, amount_paise) values ('92000000-0000-0000-0000-0000000000fb', 'pay_fake', 'captured', 32000) $$,
  '42501',
  null,
  'a consumer cannot insert a payments row claiming status=captured'
);

select lives_ok(
  $$ insert into payments (payment_order_id, razorpay_payment_id, status, amount_paise) values ('92000000-0000-0000-0000-0000000000fb', 'pay_real', 'authorized', 32000) $$,
  'a consumer can insert a payments row claiming status=authorized (what /api/payments/verify does)'
);

-- payments insert: ownership. Consumer Y cannot reference consumer X's order.
set local request.jwt.claims = '{"sub":"92000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select throws_ok(
  $$ insert into payments (payment_order_id, razorpay_payment_id, status, amount_paise) values ('92000000-0000-0000-0000-0000000000fb', 'pay_other', 'authorized', 32000) $$,
  '42501',
  null,
  'consumer Y cannot insert a payments row against consumer X''s order'
);

-- The webhook path (service_role, having already verified a signature)
-- must still be able to do exactly what a client cannot.
reset request.jwt.claims;
set local role service_role;

select lives_ok(
  $$ update payment_orders set status = 'paid' where id = '92000000-0000-0000-0000-0000000000fb' $$,
  'service_role (the webhook) can still mark an order paid directly'
);

select ok(
  (select status from payment_orders where id = '92000000-0000-0000-0000-0000000000fb') = 'paid',
  'the service_role update actually took effect, not silently filtered by RLS'
);

select * from finish();
rollback;
